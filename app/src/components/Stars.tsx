export default function Stars({ n, size = "text-[16px]", className = "" }: {
  n: number;
  size?: string;
  className?: string;
}) {
  return (
    <span className={`flex items-center gap-0.5 ${className}`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`material-symbols-outlined ${size} text-secondary`}
          style={{ fontVariationSettings: i <= n ? "'FILL' 1" : "'FILL' 0" }}
        >
          star
        </span>
      ))}
    </span>
  );
}
