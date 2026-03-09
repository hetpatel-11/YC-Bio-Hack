"use client";

import { Dna, FlaskConical } from "lucide-react";

export function Header() {
  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 border border-primary/20">
            <Dna className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              G-Hunter
            </h1>
            <p className="text-sm text-muted-foreground">
              Transmembrane Receptor Sensor Design
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20">
            <FlaskConical className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium text-accent">Demo Mode</span>
          </div>
        </div>
      </div>
    </header>
  );
}
