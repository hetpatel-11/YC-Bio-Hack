"use client";

import { useState } from "react";
import { Header } from "@/components/header";
import { StatusCards } from "@/components/status-cards";
import { CandidatesTable } from "@/components/candidates-table";
import { ParetoChart } from "@/components/pareto-chart";
import { CandidateDetail } from "@/components/candidate-detail";
import { InsertionChart } from "@/components/insertion-chart";
import { ProteinViewer } from "@/components/protein-viewer";
import {
  mockCandidates,
  mockPipelineStatus,
  mockParetoData,
  mockInsertionSites,
} from "@/lib/mock-data";

export default function DashboardPage() {
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    null
  );

  const selectedCandidate =
    mockCandidates.find((c) => c.id === selectedCandidateId) || null;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="px-6 py-6 max-w-[1600px] mx-auto space-y-6">
        {/* Status Cards */}
        <StatusCards status={mockPipelineStatus} />

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Table + Charts */}
          <div className="lg:col-span-2 space-y-6">
            <CandidatesTable
              candidates={mockCandidates}
              selectedId={selectedCandidateId}
              onSelect={setSelectedCandidateId}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ParetoChart
                data={mockParetoData}
                selectedId={selectedCandidateId}
                onSelect={setSelectedCandidateId}
              />
              <InsertionChart
                sites={mockInsertionSites}
                selectedPosition={selectedCandidate?.insertionPosition || null}
              />
            </div>
          </div>

          {/* Right Column - Detail + 3D Viewer */}
          <div className="space-y-6">
            <CandidateDetail
              candidate={selectedCandidate}
              onClose={() => setSelectedCandidateId(null)}
            />
            <ProteinViewer candidate={selectedCandidate} />
          </div>
        </div>
      </main>
    </div>
  );
}
