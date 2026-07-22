import BookstorePreview from "@/components/BookstorePreview";

export default function PreviewPage() {
  return (
    <main style={{ padding: "24px 16px" }}>
      <h1 style={{ color: "var(--lamp)", textAlign: "center", fontSize: 20 }}>
        像素书店 · 场景与角色动画预览
      </h1>
      <BookstorePreview />
    </main>
  );
}
