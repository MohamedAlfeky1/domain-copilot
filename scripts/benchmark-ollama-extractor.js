/**
 * DOMAIN COPILOT - OLLAMA EXTRACTOR PERFORMANCE BENCHMARK
 * Measures TTFT, generation speed, token counts, and step durations
 * across short, normal, and large realistic extractor prompts with the local profile:
 * - think: false
 * - keep_alive: "30m"
 * - num_predict: 600
 * - temperature: 0.1
 */

const baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const model = process.env.OLLAMA_MODEL || "qwen3:8b";

const EVIDENCE_CHUNKS_NORMAL = [
  `[Evidence 1 | ID: chk-uti-01 | Page: 4 | Section: First-Line Antimicrobial Therapy]:
For acute uncomplicated cystitis in non-pregnant adult women, first-line empiric antimicrobial regimens comprise:
1. Nitrofurantoin monohydrate/macrocrystals: 100 mg orally twice daily for 5 days. Contraindicated in patients with estimated creatinine clearance (CrCl) < 30 mL/min.
2. Trimethoprim-sulfamethoxazole (TMP-SMX): 160/800 mg (one double-strength tablet) orally twice daily for 3 days, only if local uropathogen resistance prevalence does not exceed 20%.
3. Fosfomycin trometamol: 3 g single-dose oral sachet mixed in water.`,

  `[Evidence 2 | ID: chk-uti-02 | Page: 7 | Section: Renal Dosage Adjustments]:
Nitrofurantoin should be avoided in severe renal impairment (eGFR < 30 mL/min) due to inadequate urinary drug concentration and heightened risk of peripheral neuropathy.
For TMP-SMX, dose adjustment is required when CrCl is 15–30 mL/min: reduce dose by 50% (one single-strength tablet every 12 hours). Avoid when CrCl < 15 mL/min.
Fosfomycin does not require dose adjustment in moderate renal impairment, but excretion is prolonged.`,

  `[Evidence 3 | ID: chk-uti-03 | Page: 11 | Section: Contraindications and Safety Warnings]:
Fluoroquinolones (ciprofloxacin, levofloxacin) should NOT be used as first-line agents for uncomplicated cystitis due to risk of disabling adverse effects (tendinitis, QT prolongation, aortic dissection) unless no alternative agent is clinically appropriate.`
];

const EVIDENCE_CHUNKS_LARGE = [
  ...EVIDENCE_CHUNKS_NORMAL,
  `[Evidence 4 | ID: chk-onco-01 | Page: 15 | Section: Cytotoxic Titration & Premedication]:
High-risk chemotherapy regimens incorporating platinum analogues (cisplatin, carboplatin) or anthracyclines (doxorubicin) require mandatory baseline laboratory evaluation including absolute neutrophil count (ANC >= 1500/mcL), platelet count (>= 100,000/mcL), and serum creatinine.
Dosage titration must adhere strictly to Calvert formula for carboplatin: Total Dose (mg) = Target AUC x (GFR + 25), where GFR is capped at 125 mL/min. Any titration increment exceeding 15% above standard BSA calculation requires multidisciplinary review.`,

  `[Evidence 5 | ID: chk-onco-02 | Page: 22 | Section: Hematologic Toxicity & Contraindications]:
Doxorubicin cumulative lifetime dosage must not exceed 450-550 mg/m2 due to irreversible cardiomyopathy.
Absolute contraindications to chemotherapy infusion include active uncontrolled systemic bacteremia, severe neutropenic sepsis (ANC < 500/mcL with fever > 38.3C), and baseline QTc prolongation > 500 ms.
Immediate dose reduction of 25-50% is mandated upon occurrence of Grade 3-4 myelosuppression during the preceding cycle.`
];

function buildExtractorTestPrompt(query, chunks) {
  return `You are the Evidence Extractor specialist for Domain: Healthcare & Clinical Protocols.

Your task: Extract the 3 to 5 most important factual claims, data points, and constraints directly from the provided evidence to answer the query.
Query: "${query}"

<untrusted_evidence>
${chunks.join("\n\n")}
</untrusted_evidence>

You MUST respond with valid JSON matching this exact schema:
{
  "extractedFacts": [
    {
      "statement": "<factual claim extracted from evidence>",
      "chunkId": "<ID of the evidence chunk this was extracted from>",
      "confidence": <number between 0 and 1>
    }
  ],
  "relevantSections": ["<section identifiers from evidence that are relevant>"],
  "dataCompleteness": "<one of: HIGH, MODERATE, INSUFFICIENT>"
}

Rules:
- Extract the 3 to 5 most important clinical facts directly addressing the query.
- Keep each statement concise (1-2 sentences max), factual, without redundant explanation or introductory filler.
- Only extract facts directly supported by the provided evidence.
- Assign confidence scores honestly based on evidence strength.
- Set dataCompleteness to INSUFFICIENT if evidence is sparse or ambiguous.
- Do NOT hallucinate or infer beyond what the evidence states.
- Respond with ONLY the JSON object, no markdown fences, no explanation.`;
}

async function runSingleBenchmark(label, prompt, options = {}) {
  console.log(`\n>>> Running Benchmark: ${label}`);
  const maxTokens = options.num_predict || 600;
  const t0 = Date.now();
  let ttft = null;
  let fullText = "";

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      stream: true,
      think: false,
      keep_alive: "30m",
      options: {
        temperature: 0.1,
        num_predict: maxTokens
      }
    })
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let promptTokens = 0;
  let completionTokens = 0;
  let evalDurationSec = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    for (const line of chunk.split("\n").filter(Boolean)) {
      try {
        const j = JSON.parse(line);
        if (ttft === null && j.message?.content) {
          ttft = Date.now() - t0;
        }
        if (j.message?.content) {
          fullText += j.message.content;
        }
        if (j.done) {
          promptTokens = j.prompt_eval_count || 0;
          completionTokens = j.eval_count || 0;
          if (j.eval_duration) {
            evalDurationSec = j.eval_duration / 1e9;
          }
        }
      } catch {}
    }
  }

  const totalDurationMs = Date.now() - t0;
  const tokensPerSec = evalDurationSec > 0 ? (completionTokens / evalDurationSec).toFixed(1) : "N/A";
  const within30s = totalDurationMs < 30000;
  const within60s = totalDurationMs < 60000;

  let isValidJson = false;
  let parsedFactsCount = 0;
  try {
    const parsed = JSON.parse(fullText.trim());
    isValidJson = true;
    if (Array.isArray(parsed.extractedFacts)) {
      parsedFactsCount = parsed.extractedFacts.length;
    }
  } catch {}

  console.log(`  TTFT: ${ttft} ms`);
  console.log(`  Prompt Tokens: ${promptTokens}`);
  console.log(`  Completion Tokens: ${completionTokens} (budget: ${maxTokens})`);
  console.log(`  Total Duration: ${(totalDurationMs / 1000).toFixed(2)} s`);
  console.log(`  Generation Speed: ${tokensPerSec} tokens/sec`);
  console.log(`  Valid JSON Extractor Schema: ${isValidJson ? `YES (${parsedFactsCount} facts)` : "NO"}`);
  console.log(`  Within 30s timeout: ${within30s ? "YES" : "NO"}`);
  console.log(`  Within 60s timeout: ${within60s ? "YES" : "NO"}`);

  return {
    label,
    ttft,
    promptTokens,
    completionTokens,
    totalDurationMs,
    tokensPerSec,
    isValidJson,
    parsedFactsCount,
    within30s,
    within60s
  };
}

async function main() {
  console.log("================================================================================");
  console.log(`OLLAMA PERFORMANCE BENCHMARK: ${model} on ${baseUrl}`);
  console.log("Profile: think=false, keep_alive=30m, temperature=0.1, num_predict=600");
  console.log("================================================================================");

  // Prompt A: Short prompt
  const benchA = await runSingleBenchmark(
    "A. Short Clinical Prompt",
    "What is the first-line medication for acute uncomplicated hypertension in non-black patients? Answer in 2 sentences.",
    { num_predict: 200 }
  );

  // Prompt B: Normal Extractor Prompt (3 Evidence Chunks)
  const promptB = buildExtractorTestPrompt(
    "What are the recommended first-line antibiotics and dosage adjustments for acute uncomplicated cystitis?",
    EVIDENCE_CHUNKS_NORMAL
  );
  const benchB = await runSingleBenchmark(
    "B. Normal Extractor Prompt (3 Chunks)",
    promptB,
    { num_predict: 600 }
  );

  // Prompt C: Largest Realistic Extractor Prompt (5 Evidence Chunks)
  const promptC = buildExtractorTestPrompt(
    "What are the dosage titration boundaries and contraindications for oncology chemotherapy?",
    EVIDENCE_CHUNKS_LARGE
  );
  const benchC = await runSingleBenchmark(
    "C. Largest Realistic Extractor Prompt (5 Chunks)",
    promptC,
    { num_predict: 600 }
  );

  console.log("\n================================================================================");
  console.log("BENCHMARK SUMMARY TABLE");
  console.log("================================================================================");
  console.table([
    {
      Scenario: benchA.label,
      "TTFT (ms)": benchA.ttft,
      "Prompt Tok": benchA.promptTokens,
      "Comp Tok": benchA.completionTokens,
      "Duration (s)": (benchA.totalDurationMs / 1000).toFixed(2),
      "Speed (t/s)": benchA.tokensPerSec,
      "< 30s": benchA.within30s ? "PASS" : "FAIL",
      "< 60s": benchA.within60s ? "PASS" : "FAIL",
    },
    {
      Scenario: benchB.label,
      "TTFT (ms)": benchB.ttft,
      "Prompt Tok": benchB.promptTokens,
      "Comp Tok": benchB.completionTokens,
      "Duration (s)": (benchB.totalDurationMs / 1000).toFixed(2),
      "Speed (t/s)": benchB.tokensPerSec,
      "< 30s": benchB.within30s ? "PASS" : "FAIL",
      "< 60s": benchB.within60s ? "PASS" : "FAIL",
    },
    {
      Scenario: benchC.label,
      "TTFT (ms)": benchC.ttft,
      "Prompt Tok": benchC.promptTokens,
      "Comp Tok": benchC.completionTokens,
      "Duration (s)": (benchC.totalDurationMs / 1000).toFixed(2),
      "Speed (t/s)": benchC.tokensPerSec,
      "< 30s": benchC.within30s ? "PASS" : "FAIL",
      "< 60s": benchC.within60s ? "PASS" : "FAIL",
    }
  ]);
  console.log("================================================================================");
}

main().catch(err => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
