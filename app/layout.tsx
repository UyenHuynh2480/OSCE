
import './globals.css';

export const metadata = {
  title: 'OSCE System',
  description: 'Quản lý thi OSCE',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Bật/tắt Dark Mode: thêm class "dark" vào <html> nếu cần
  return (
    <html lang="vi" className="">
      <body className="bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
