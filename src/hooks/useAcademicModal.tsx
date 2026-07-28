import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { AcademicModal } from "@/components/AcademicModal";

type AcademicCtx = {
  openAcademic: () => void;
  closeAcademic: () => void;
};

const Ctx = createContext<AcademicCtx | null>(null);

export function AcademicProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const openAcademic = useCallback(() => setOpen(true), []);
  const closeAcademic = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ openAcademic, closeAcademic }), [openAcademic, closeAcademic]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <AcademicModal open={open} onOpenChange={setOpen} />
    </Ctx.Provider>
  );
}

export function useAcademicModal() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAcademicModal must be used within AcademicProvider");
  return ctx;
}
