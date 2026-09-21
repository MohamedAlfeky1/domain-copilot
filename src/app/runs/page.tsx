import { redirect } from "next/navigation";

export default function RunsIndexPage() {
  redirect("/runs/latest");
}
