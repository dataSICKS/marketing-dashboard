import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import type {
  OptoutMailAnalysis, OptoutMailSequenceBucket, OptoutMailNodeItem, OptoutMailLtvCohort,
} from "@workspace/api-client-react";
import { AlertTriangle } from "lucide-react";
import { formatNumber } from "@/lib/format";

const CARD = { border: "1px solid #EBEBEB", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" };
const BAR = "#61A9BD";
const BAR_THIN = "#C7DCE4";
/** 母数が小さいところは率が暴れるので、色を落として「根拠が弱い」と分かるようにする。 */
const THIN_EVIDENCE = 500;

/** 率は小数2桁。1.79% と 1.8% では、テンプレート間の差の読み方が変わる。 */
const pct = (value: number) => `${(value * 100).toFixed(2)}%`;

function Section({ title, lead, children, testId }: {
  title: string; lead: string; children: React.ReactNode; testId: string;
}) {
  return (
    <section className="bg-white rounded-xl p-4 md:p-6 min-w-0" style={CARD} data-testid={testId}>
      <h2 className="text-sm font-bold text-gray-900">{title}</h2>
      <p className="mt-0.5 text-xs leading-5 text-gray-400">{lead}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`px-3 py-2 font-medium whitespace-nowrap ${right ? "text-right" : "text-left"}`}>{children}</th>;
}

function Td({ children, right, dim, mono }: { children: React.ReactNode; right?: boolean; dim?: boolean; mono?: boolean }) {
  return (
    <td className={`px-3 py-2 ${right ? "text-right tabular-nums" : ""} ${dim ? "text-gray-400" : ""} ${mono ? "font-mono" : ""}`}>
      {children}
    </td>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-8 text-center text-xs text-gray-400">{children}</div>;
}

/* ───────────────────────── 網羅率の警告 ───────────────────────── */

export function CoverageNotice({ data }: { data: OptoutMailAnalysis }) {
  const { coverageRatio, aggregateDeliveries, deliveryEvents } = data.coverage;
  const missing = data.missingScenarios;
  if (!missing.length && (coverageRatio === null || coverageRatio >= 0.95)) return null;
  return (
    <div role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900"
      style={{ border: "1px solid #FDE68A" }} data-testid="alert-delivery-coverage">
      <div className="flex items-start gap-2">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <strong>顧客ごとの配信履歴は、まだ全部そろっていません。</strong>
          {aggregateDeliveries !== null && (
            <> 同じ期間の集計側が {formatNumber(aggregateDeliveries)} 通に対し、顧客ごとの記録は {formatNumber(deliveryEvents)} 件です。</>
          )}
          <div className="mt-1">
            MAのCSVはシナリオ1本ずつ手で書き出すため、書き出していないシナリオの配信は記録に入りません。
            そのぶん受信通数が実際より少なく見え、<strong>「何通目」は取得できている配信の中での順番</strong>になります。
            実際にはその前に別のシナリオのメールが届いている可能性があります。
          </div>
          {missing.length > 0 && (
            <div className="mt-2">
              <div className="font-semibold">書き出し直すと埋まるシナリオ（不足の多い順）</div>
              <ul className="mt-1 space-y-0.5">
                {missing.map((item) => (
                  <li key={item.scenarioName} className="tabular-nums break-words">
                    不足 {formatNumber(item.missingDeliveries)} 通 ／ 期間内の配信 {formatNumber(item.deliveries)} 通
                    <span className="ml-1 font-mono text-[11px]">{item.scenarioName}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-2 text-[11px] text-amber-800/80">
            集計側の配信数も、メルマガ分析の取り込みをやり直すまでは実際より少なく出ます（読み取り行数の上限を広げたばかりのため）。
            不足の通数は<strong>少なくともこの数</strong>と読んでください。
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────── ① 何通目で解除されやすいか ──────────────────── */

function HazardTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: OptoutMailSequenceBucket }> }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
      <div className="font-semibold text-gray-800">{p.sequence}通目</div>
      <div className="mt-1 tabular-nums text-gray-600">
        到達 {formatNumber(p.reached)} 人のうち {formatNumber(p.churned)} 人が解除 → {pct(p.hazard)}
      </div>
      <div className="tabular-nums text-gray-400">ここまでの累積解除 {pct(p.cumulativeShare)}</div>
    </div>
  );
}

export function SequenceHazard({ data }: { data: OptoutMailAnalysis }) {
  const buckets = data.sequence;
  return (
    <Section testId="card-sequence-hazard"
      title="何通目で解除されやすいか"
      lead="その通数まで受け取った人を分母にした、その通で解除する率（ハザード）です。母数が小さい右端は率が暴れるので、到達人数と併せて読んでください。">
      {buckets.length === 0 ? <Empty>表示できる配信履歴がありません。</Empty> : (
        <>
          <div style={{ height: 240 }} data-testid="chart-sequence-hazard">
            <ResponsiveContainer width="100%" height="100%" debounce={0}>
              <BarChart data={buckets} margin={{ top: 12, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                <XAxis dataKey="sequence" stroke="#D1D5DB" fontSize={10} tickLine={false} axisLine={false}
                  tickFormatter={(v) => `${v}通目`} />
                <YAxis stroke="#D1D5DB" fontSize={10} tickLine={false} axisLine={false} width={44}
                  tickFormatter={(v) => `${((v as number) * 100).toFixed(1)}%`} />
                <Tooltip content={<HazardTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} isAnimationActive={false} />
                <Bar dataKey="hazard" name="解除率" maxBarSize={36} radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  {buckets.map((b) => (
                    <Cell key={b.sequence} fill={b.reached < THIN_EVIDENCE ? BAR_THIN : BAR} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr><Th>通目</Th><Th right>到達した顧客</Th><Th right>その通で解除</Th><Th right>解除率</Th><Th right>累積解除率</Th></tr>
              </thead>
              <tbody>
                {buckets.map((b) => (
                  <tr key={b.sequence} className="border-t border-gray-100" data-testid={`row-sequence-${b.sequence}`}>
                    <Td>{b.sequence}通目</Td>
                    <Td right dim={b.reached < THIN_EVIDENCE}>{formatNumber(b.reached)}</Td>
                    <Td right>{formatNumber(b.churned)}</Td>
                    <Td right dim={b.reached < THIN_EVIDENCE}>{pct(b.hazard)}</Td>
                    <Td right dim>{pct(b.cumulativeShare)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] leading-5 text-gray-400">
            薄い色と灰色の数字は到達 {formatNumber(THIN_EVIDENCE)} 人未満です。判定できなかった解除（解除日当日の配信のみ {formatNumber(data.coverage.undecidableSameDay)} 人／
            解除前の記録なし {formatNumber(data.coverage.undecidableNoHistory)} 人）は、どの通目にも入れていません。
          </p>
        </>
      )}
    </Section>
  );
}

/* ─────────────── ②④ どのメールの直後に解除されたか ─────────────── */

function NodeTable({ items, testId }: { items: OptoutMailNodeItem[]; testId: string }) {
  if (!items.length) return <Empty>表示できるテンプレートがありません（表示下限に届いていません）。</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-xs" data-testid={testId}>
        <thead className="bg-gray-50 text-gray-500">
          <tr><Th>メール（テンプレート／ノード）</Th><Th right>配信</Th><Th right>直後に解除</Th><Th right>解除率</Th><Th right>主に何通目</Th></tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={`${item.templateName}|${item.nodeId}`} className="border-t border-gray-100">
              <Td>
                <span className="break-words">{item.label}</span>
                {item.scenarioName && item.label !== item.scenarioName && (
                  <span className="ml-1 text-[10px] text-gray-400">{item.scenarioName}</span>
                )}
              </Td>
              <Td right dim={item.events < THIN_EVIDENCE}>{formatNumber(item.events)}</Td>
              <Td right>{formatNumber(item.churned)}</Td>
              <Td right dim={item.events < THIN_EVIDENCE}>{pct(item.hazard)}</Td>
              <Td right dim>{item.medianSequence}通目</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function NodeHazard({ data }: { data: OptoutMailAnalysis }) {
  const tabs = [
    { key: "all", label: "すべての通目", items: data.nodes },
    ...data.nodesBySequence.map((group) => ({
      key: String(group.sequence), label: `${group.sequence}通目だけ`, items: group.items,
    })),
  ];
  const [active, setActive] = useState("all");
  const current = tabs.find((tab) => tab.key === active) ?? tabs[0];
  return (
    <Section testId="card-node-hazard"
      title="どのメールの直後に解除されたか"
      lead="分母はそのメールの配信件数です。「直後」は、取得できている記録の中で解除前の最後の配信だったという意味です。">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="通目の絞り込み">
        {tabs.map((tab) => (
          <button key={tab.key} role="tab" aria-selected={tab.key === active} onClick={() => setActive(tab.key)}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${tab.key === active ? "bg-amber-400 text-white" : "border border-gray-200 bg-white text-gray-600"}`}
            data-testid={`tab-node-${tab.key}`}>
            {tab.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-5 text-gray-400">
        通目を揃えると、中身の差を配信順の差から切り離せます。1通目同士で比べたときに差が残るなら、それは順番ではなく<strong>内容の差</strong>です。
      </p>
      <div className="mt-3"><NodeTable items={current.items} testId={`table-nodes-${current.key}`} /></div>
      {data.lowVolumeNodes > 0 && (
        <p className="mt-2 text-[11px] text-gray-400">
          配信が少なく率が安定しないノード {formatNumber(data.lowVolumeNodes)} 件は表示していません。
        </p>
      )}
    </Section>
  );
}

/* ──────────────────── ③ 頻度と解除 ──────────────────── */

export function FrequencyHazard({ data }: { data: OptoutMailAnalysis }) {
  const groups = data.frequency.filter((group) => group.buckets.length > 0);
  return (
    <Section testId="card-frequency-hazard"
      title="前のメールからの間隔と解除"
      lead="同じ通目の中だけで間隔を比べています。通目をまたいで比べると、密に受け取り続けている顧客＝まだ解除していない顧客に偏り、送るほど解除が減るという逆向きの結論が出ます。">
      {groups.length === 0 ? <Empty>比較できる配信がありません。</Empty> : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <div key={group.sequence} className="min-w-0">
              <h3 className="text-xs font-bold text-gray-700">{group.sequence}通目を受け取った人の中で</h3>
              <div className="mt-1.5 overflow-x-auto">
                <table className="w-full min-w-[460px] text-xs" data-testid={`table-frequency-${group.sequence}`}>
                  <thead className="bg-gray-50 text-gray-500">
                    <tr><Th>前のメールからの間隔</Th><Th right>配信</Th><Th right>直後に解除</Th><Th right>解除率</Th></tr>
                  </thead>
                  <tbody>
                    {group.buckets.map((bucket) => (
                      <tr key={bucket.bucket} className="border-t border-gray-100">
                        <Td>{bucket.label}</Td>
                        <Td right dim={bucket.events < THIN_EVIDENCE}>{formatNumber(bucket.events)}</Td>
                        <Td right>{formatNumber(bucket.churned)}</Td>
                        <Td right dim={bucket.events < THIN_EVIDENCE}>{pct(bucket.hazard)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-[11px] leading-5 text-gray-400">
        間隔はシナリオの設計で決まるため、間隔の差にはシナリオの中身の差も混ざっています。
        この表だけで「何日おきが最適」とは決められません。間隔の違いが同じシナリオ内で起きている場合に限って、頻度の効果として読めます。
      </p>
    </Section>
  );
}

/* ──────────────────── ② LTVと解除 ──────────────────── */

function diffText(cohort: OptoutMailLtvCohort) {
  const diff = cohort.withLtv180 - cohort.withoutLtv180;
  return `${diff > 0 ? "+" : ""}${formatNumber(diff)}`;
}

export function LtvByOptout({ data }: { data: OptoutMailAnalysis }) {
  const cohorts = data.ltvCohorts.filter((cohort) => cohort.withCount + cohort.withoutCount > 0);
  return (
    <Section testId="card-ltv-optout"
      title="LTVと解除の関係"
      lead="初回購入月ごとに、解除した顧客と解除していない顧客のLTVを比べます。顧客単位で、複数定期がある顧客は最も早い初回購入月の定期に寄せています。">
      {cohorts.length === 0 ? <Empty>比較できる購入データがありません。</Empty> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs" data-testid="table-ltv-cohorts">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <Th>初回購入月</Th>
                <Th right>解除なし</Th><Th right>LTV180</Th>
                <Th right>解除あり</Th><Th right>LTV180</Th>
                <Th right>差</Th><Th right>解除率</Th>
              </tr>
            </thead>
            <tbody>
              {cohorts.map((cohort) => (
                <tr key={cohort.cohortMonth} className="border-t border-gray-100" data-testid={`row-cohort-${cohort.cohortMonth}`}>
                  <Td>
                    {cohort.cohortMonth.replace("-", "/")}
                    {!cohort.mature180 && <span className="ml-1 rounded bg-gray-100 px-1 py-0.5 text-[10px] text-gray-500">180日未経過</span>}
                  </Td>
                  <Td right>{formatNumber(cohort.withoutCount)}</Td>
                  <Td right dim={!cohort.mature180}>¥{formatNumber(cohort.withoutLtv180)}</Td>
                  <Td right dim={cohort.withCount < 30}>{formatNumber(cohort.withCount)}</Td>
                  <Td right dim={!cohort.mature180 || cohort.withCount < 30}>¥{formatNumber(cohort.withLtv180)}</Td>
                  <Td right dim={!cohort.mature180 || cohort.withCount < 30}>{diffText(cohort)}</Td>
                  <Td right dim>{pct(cohort.optoutRate)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ul className="mt-3 list-disc space-y-1 pl-4 text-[11px] leading-5 text-gray-400">
        <li>「180日未経過」の月はLTV180がまだ伸びる途中です。この月同士でなら比べられますが、成熟した月との比較はできません。</li>
        <li>解除あり30人未満の月は灰色にしています。差が偶然で動く範囲です。</li>
        <li>
          解除率が新しい月ほど低いのは、解除する時間がまだ短いためです。月をまたいだ解除率の比較はできません。
        </li>
        <li>
          <strong>差がマイナスでも、配信を止めたからLTVが下がったとは言えません。</strong>
          解約した顧客がついでに配信も止めた、という逆向きの説明が同じくらい成り立ちます。このデータでは区別できません。
        </li>
      </ul>
    </Section>
  );
}

/* ──────────────────── まとめて差し込む ──────────────────── */

export function OptoutMailBlocks({ data }: { data: OptoutMailAnalysis }) {
  return (
    <>
      <CoverageNotice data={data} />
      <SequenceHazard data={data} />
      <NodeHazard data={data} />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-5">
        <FrequencyHazard data={data} />
        <LtvByOptout data={data} />
      </div>
    </>
  );
}
