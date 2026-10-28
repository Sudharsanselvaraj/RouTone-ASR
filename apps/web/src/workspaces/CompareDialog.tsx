import { useEffect, useState } from 'react';
import { api } from '../api';
import { compareRuns } from '../lib/analysis';
import type { CompareRow } from '../lib/analysis';
import { Dialog, Spinner } from '../components/ui';
import type { RunRecord } from '../types';

export function CompareDialog({ ids, onClose }: { ids: [string, string]; onClose: () => void }) {
  const [recs, setRecs] = useState<[RunRecord, RunRecord] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([api.run(ids[0]), api.run(ids[1])])
      .then((r) => live && setRecs([r[0], r[1]]))
      .catch((e) => live && setErr(e instanceof Error ? e.message : 'Could not load runs'));
    return () => {
      live = false;
    };
  }, [ids]);

  const cmp = recs ? compareRuns(recs[0], recs[1]) : null;
  const groups = ['Configuration', 'Measured', 'Output'] as const;

  return (
    <Dialog title="Compare experiments" onClose={onClose} wide>
      {err && <p className="text-red">{err}</p>}
      {!recs && !err && <Spinner label="Loading both runs" />}
      {recs && cmp && (
        <>
          <ul className="notes">
            {cmp.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
          <div className="table-scroll">
            <table className="table compare-table">
              <thead>
                <tr>
                  <th scope="col">Quantity</th>
                  <th scope="col" className="mono">A · {recs[0].filename}</th>
                  <th scope="col" className="mono">B · {recs[1].filename}</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <GroupRows key={g} group={g} rows={cmp.rows.filter((r) => r.group === g)} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="meta">Highlighted rows differ. Metrics here are measurements from each run; there is no reference transcript, so output differences are not scored.</p>
        </>
      )}
    </Dialog>
  );
}

function GroupRows({ group, rows }: { group: string; rows: CompareRow[] }) {
  return (
    <>
      <tr className="group-row"><th colSpan={3} scope="colgroup">{group}</th></tr>
      {rows.map((r) => (
        <tr key={r.label} className={r.differs ? 'is-diff' : ''}>
          <th scope="row">{r.label}</th>
          <td className="mono">{r.a}</td>
          <td className="mono">{r.b}</td>
        </tr>
      ))}
    </>
  );
}
