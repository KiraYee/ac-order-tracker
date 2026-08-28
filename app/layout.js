import "./globals.css";

export const metadata = {
  title: "空调维保工单台账",
  description: "空调维修维保工单进度追踪",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
