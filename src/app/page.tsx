import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAuthToken } from "@/infrastructure/auth/tokens";

export default async function HomePage() {
  const token = cookies().get("dc_token")?.value;
  const payload = token ? await verifyAuthToken(token) : null;
  if (payload) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}
