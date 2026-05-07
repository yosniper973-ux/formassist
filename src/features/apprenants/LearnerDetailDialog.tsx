import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, FileCheck, TrendingUp, Mail, Phone, ChevronRight, Loader2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { CorrectionDetailDialog } from "@/features/correction/CorrectionDetailDialog";
import type { Learner } from "@/types/learner";
import type { Correction } from "@/types/correction";

interface Props {
  learner: Learner;
  onClose: () => void;
}

interface CorrectionRow extends Correction {
  content_title: string | null;
}

export function LearnerDetailDialog({ learner, onClose }: Props) {
  const [corrections, setCorrections] = useState<CorrectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCorrectionId, setOpenCorrectionId] = useState<string | null>(null);

  useEffect(() => {
    loadCorrections();
  }, [learner.id]);

  async function loadCorrections() {
    setLoading(true);
    try {
      const rows = await db.query<CorrectionRow>(
        `SELECT c.*, gc.title as content_title
         FROM corrections c
         LEFT JOIN generated_contents gc ON c.content_id = gc.id
         WHERE c.learner_id = ?
         ORDER BY c.created_at ASC`,
        [learner.id],
      );
      setCorrections(rows);
    } finally {
      setLoading(false);
    }
  }

  const gradedCorrections = corrections.filter(
    (c) => c.grade != null && c.max_grade != null && c.max_grade > 0,
  );
  const average = gradedCorrections.length > 0
    ? gradedCorrections.reduce((sum, c) => sum + (c.grade! / c.max_grade!) * 20, 0) / gradedCorrections.length
    : null;

  const chartData = gradedCorrections.map((c, i) => ({
    index: i + 1,
    date: new Date(c.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
    note: Math.round((c.grade! / c.max_grade!) * 20 * 10) / 10,
    title: c.content_title ?? "Sans exercice",
  }));

  const gradeColor = (grade: number, max: number) => {
    const r = grade / max;
    if (r >= 0.8) return "text-green-600";
    if (r >= 0.6) return "text-yellow-600";
    if (r >= 0.4) return "text-orange-500";
    return "text-red-600";
  };

  const trend = gradedCorrections.length >= 2
    ? (gradedCorrections[gradedCorrections.length - 1]!.grade! / gradedCorrections[gradedCorrections.length - 1]!.max_grade!) * 20
      - (gradedCorrections[0]!.grade! / gradedCorrections[0]!.max_grade!) * 20
    : null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-4xl max-h-[92vh] overflow-hidden rounded-xl bg-card shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">
              {learner.first_name[0]}{learner.last_name[0]}
            </div>
            <div>
              <h2 className="text-xl font-semibold">
                {learner.first_name} {learner.last_name}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {learner.email && (
                  <span className="inline-flex items-center gap-1">
                    <Mail className="h-3 w-3" /> {learner.email}
                  </span>
                )}
                {learner.phone && (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {learner.phone}
                  </span>
                )}
                {learner.initial_level && (
                  <Badge variant="outline" className="text-xs">{learner.initial_level}</Badge>
                )}
              </div>
              {learner.specific_needs && (
                <p className="mt-1.5 text-xs text-amber-700">
                  Besoins spécifiques : {learner.specific_needs}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="ml-3 flex shrink-0 items-center gap-1.5 rounded-md border bg-muted px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent" aria-label="Fermer">
            <X className="h-4 w-4" />
            Fermer
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Stats */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatCard label="Corrections" value={String(corrections.length)} icon={<FileCheck className="h-5 w-5 text-blue-500" />} />
                <StatCard
                  label="Moyenne"
                  value={average != null ? `${average.toFixed(1)} / 20` : "—"}
                  valueClassName={average != null ? gradeColor(average, 20) : ""}
                  icon={<TrendingUp className="h-5 w-5 text-purple-500" />}
                />
                <StatCard
                  label="Évolution"
                  value={trend != null ? `${trend > 0 ? "+" : ""}${trend.toFixed(1)} pt` : "—"}
                  valueClassName={trend != null ? (trend >= 0 ? "text-green-600" : "text-red-600") : ""}
                  icon={<TrendingUp className={`h-5 w-5 ${trend != null && trend >= 0 ? "text-green-500" : "text-red-500"}`} />}
                />
              </div>

              {/* Chart */}
              {chartData.length >= 2 && (
                <div className="rounded-lg border p-4">
                  <h3 className="mb-3 text-sm font-semibold">Évolution des notes</h3>
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                        <YAxis domain={[0, 20]} ticks={[0, 5, 10, 15, 20]} tick={{ fontSize: 11 }} stroke="#94a3b8" />
                        <ReferenceLine y={10} stroke="#cbd5e1" strokeDasharray="2 4" />
                        <Tooltip
                          contentStyle={{ fontSize: 12, borderRadius: 8 }}
                          formatter={(v) => [`${v}/20`, "Note"]}
                          labelFormatter={(l, payload) => {
                            const title = (payload?.[0]?.payload as { title?: string } | undefined)?.title ?? "";
                            return `${String(l)} — ${title}`;
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="note"
                          stroke="#2471A3"
                          strokeWidth={2.5}
                          dot={{ r: 4, fill: "#2471A3" }}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Corrections list */}
              <div>
                <h3 className="mb-3 text-sm font-semibold">Historique des corrections</h3>
                {corrections.length === 0 ? (
                  <div className="rounded-lg border bg-muted/30 p-8 text-center">
                    <FileCheck className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">
                      Aucune correction enregistrée pour cet apprenant.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {[...corrections].reverse().map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setOpenCorrectionId(c.id)}
                        className="flex w-full items-center gap-3 rounded-lg border p-3 text-left hover:bg-muted/40"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {c.content_title ?? "Sans exercice"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(c.created_at).toLocaleDateString("fr-FR", {
                              day: "numeric", month: "long", year: "numeric",
                            })}
                          </p>
                        </div>
                        {c.grade != null && (
                          <div className="text-right">
                            <span className={`text-base font-bold ${gradeColor(c.grade, c.max_grade)}`}>
                              {c.grade}
                            </span>
                            <span className="text-xs text-muted-foreground">/{c.max_grade}</span>
                          </div>
                        )}
                        {c.sent_at ? (
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 shrink-0">Envoyée</Badge>
                        ) : c.validated ? (
                          <Badge className="bg-green-100 text-green-700 hover:bg-green-100 shrink-0">Validée</Badge>
                        ) : (
                          <Badge variant="outline" className="shrink-0">Brouillon</Badge>
                        )}
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {openCorrectionId && (
        <CorrectionDetailDialog
          correctionId={openCorrectionId}
          onClose={() => setOpenCorrectionId(null)}
        />
      )}
    </div>,
    document.body
  );
}

function StatCard({
  label,
  value,
  icon,
  valueClassName = "",
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/50">
        {icon}
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-xl font-bold ${valueClassName}`}>{value}</p>
      </div>
    </div>
  );
}
