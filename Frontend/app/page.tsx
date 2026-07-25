import Link from "next/link";

export default function Home() {
  return (
    <main style={{ padding: "48px", maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ color: "var(--lamp)", marginBottom: 8 }}>云中谁寄锦书来</h1>
      <p style={{ opacity: 0.8, fontStyle: "italic", marginTop: 0 }}>
        雁字回时，月满西楼。
      </p>
      <p style={{ marginTop: 28, lineHeight: 1.8 }}>
        欢迎来到 The Stationery。愿你在这里写下、也收到，一封值得等待的信。
      </p>
      <p style={{ marginTop: 24 }}>
        <Link href="/preview" style={{ color: "var(--lamp)" }}>
          → 推门进入书店
        </Link>
      </p>
    </main>
  );
}
