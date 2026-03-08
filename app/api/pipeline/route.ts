import { NextResponse } from "next/server";
import {
  mockCandidates,
  mockPipelineStatus,
  mockParetoData,
  mockInsertionSites,
} from "@/lib/mock-data";

export async function GET() {
  // In production, this would read from:
  // - results/runs/*.jsonl for candidate data
  // - results/tamarind_cache.json for cached API results
  // - results/tamarind_calls.json for API usage tracking
  // - results/pareto.json for Pareto front data

  return NextResponse.json({
    candidates: mockCandidates,
    status: mockPipelineStatus,
    paretoData: mockParetoData,
    insertionSites: mockInsertionSites,
  });
}

export async function POST(request: Request) {
  // In production, this would trigger pipeline actions:
  // - Start/stop GA search
  // - Submit batch to Tamarind
  // - Refresh data from disk

  const body = await request.json();
  const { action } = body;

  switch (action) {
    case "refresh":
      // Re-read data from disk
      return NextResponse.json({ success: true, message: "Data refreshed" });
    
    case "start_ga":
      // Trigger GA search
      return NextResponse.json({ success: true, message: "GA search started" });
    
    case "submit_esmfold":
      // Submit top-50 to ESMFold
      return NextResponse.json({ success: true, message: "ESMFold batch submitted" });
    
    case "submit_af2":
      // Submit top-5 to AlphaFold2
      return NextResponse.json({ success: true, message: "AF2 batch submitted" });
    
    default:
      return NextResponse.json(
        { success: false, message: "Unknown action" },
        { status: 400 }
      );
  }
}
