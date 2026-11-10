import Link from "next/link";
import { card, h4, pill } from "@/components/ui";
import type { Decision } from "@/lib/board";

export default function DecisionsTable({ decisions, datasetId }: { decisions: Decision[]; datasetId: string }) {
  return (
    <section className={`${card} col-span-2 min-w-0`} aria-labelledby="decisions-h">
      <h2 id="decisions-h" className={h4}>Последние решения</h2>
      {decisions.length === 0 ? (
        <p className="text-sm text-mute">Решений ещё нет.</p>
      ) : (
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-xs text-mute">
                <th scope="col" className="border-b border-line px-2 py-1.5 font-medium">Документ</th>
                <th scope="col" className="border-b border-line px-2 py-1.5 font-medium">Поле</th>
                <th scope="col" className="hidden border-b border-line px-2 py-1.5 font-medium sm:table-cell">A / B</th>
                <th scope="col" className="border-b border-line px-2 py-1.5 font-medium">Итог</th>
              </tr>
            </thead>
            <tbody>
              {decisions.map((d) => (
                <tr key={d.id} className="align-top">
                  <td className="max-w-48 border-b border-line px-2 py-2">
                    <Link href={`/d/${datasetId}/docs/${d.id}`} className="line-clamp-2 break-words hover:text-acc">{d.filename}</Link>
                  </td>
                  <td className="whitespace-nowrap border-b border-line px-2 py-2 text-mute">{d.field}</td>
                  <td className="hidden max-w-56 border-b border-line px-2 py-2 sm:table-cell">
                    <span className={d.a === d.b ? "" : "text-warn"}>{d.a} / {d.b}</span>
                  </td>
                  <td className="border-b border-line px-2 py-2"><span className={pill(d.status)}>{d.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
