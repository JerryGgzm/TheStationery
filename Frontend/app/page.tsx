import Link from "next/link";

export default function Home() {
  return (
    <main style={{ padding: "48px", maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ color: "var(--lamp)" }}>The Stationery — 像素书店</h1>
      <p>雨夜书店书信社区 · 素材与场景预览工程骨架。</p>
      <p>
        <Link href="/preview" style={{ color: "var(--lamp)" }}>
          → 打开书店场景 / 角色动画预览
        </Link>
      </p>
    </main>
  );
}
