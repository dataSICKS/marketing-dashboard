export default function NewsletterRowSubject({ subject }: { subject: string | null }) {
  return (
    <div className="mt-1 flex items-baseline gap-1.5 text-xs font-normal leading-5">
      <span className="shrink-0 text-gray-500">件名</span>
      <span className="break-all text-gray-800">{subject ?? "（件名未取得）"}</span>
    </div>
  );
}
