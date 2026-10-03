import type { Metadata } from "next";
import { ResearchWorkspace } from "@/components/ResearchWorkspace";
export const metadata: Metadata = { title: "Daily research", description: "Ranked NSE research, fundamental checks and dated news sentiment." };
export default function ResearchPage() { return <ResearchWorkspace />; }
