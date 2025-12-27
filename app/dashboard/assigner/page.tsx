
// app/dashboard/assigner/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const ADMIN_DASHBOARD_PATH = "/dashboard/admin";
const UPLOADER_DASHBOARD_PATH = "/dashboard/uploader";

export default function AssignerPage() {
  const router = useRouter();

  // role: null (chưa biết) | 'admin' | 'uploader' | 'assigner' | ...
  const [role, setRole] = useState<string | null>(null);
  const [loadingRole, setLoadingRole] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        if (!uid) {
          if (mounted) setRole(null);
          return;
        }
        const { data, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("user_id", uid)
          .limit(1)
          .single();

        if (mounted) {
          if (error) {
            console.warn("Load role error:", error.message);
            setRole(null);
          } else {
            const normalized = (data?.role ?? "")
              .toString()
              .trim()
              .toLowerCase();
            console.log("DEBUG role:", normalized);
            setRole(normalized || null);
          }
        }
      } finally {
        if (mounted) setLoadingRole(false);
      }
    })();

    // Optional: theo dõi thay đổi phiên để tránh render sai khi token đổi
    const { data: sub } = supabase.auth.onAuthStateChange((_event, _session) => {
      // Có thể setLoadingRole(true) và refetch nếu muốn
    });

    return () => {
      mounted = false;
      sub?.subscription.unsubscribe();
    };
  }, []);

  const isAdmin = role === "admin";
  const isUploader = role === "uploader";
  const isAssigner = role === "assigner";

  // Exit: điều hướng đến nơi mà assigner ĐƯỢC PHÉP vào (tránh /grading/setup)
  const exit = () => {
    router.push("/assign-chain");
  };

  return (
    <div style={{ padding: 12 }}>
      <h2 style={{ marginBottom: 8 }}>Xếp chuỗi (Assigner)</h2>

      {/* ⛔ Không render nút khi chưa biết role để tránh nhấp nháy */}
      <div style={{ marginBottom: 12, display: "flex", gap: 8 }}>
        {!loadingRole && (
          <>
            {isAdmin && (
              <button
                onClick={() => router.push(ADMIN_DASHBOARD_PATH)}
                title="Quay về Admin Dashboard"
                style={{
                  background: "#0a1630",
                  color: "#ffdf3b",
                  border: "2px solid #0b5ed7",
                  padding: "8px 12px",
                  borderRadius: 8,
                  fontWeight: 800,
                  fontSize: 14,
                  boxShadow: "0 2px 6px rgba(9,49,107,.2)",
                }}
              >
                ⬅️ Admin Dashboard
              </button>
            )}

            {isUploader && (
              <button
                onClick={() => router.push(UPLOADER_DASHBOARD_PATH)}
                title="Quay về Uploader Dashboard"
                style={{
                  background: "#0a1630",
                  color: "#ffdf3b",
                  border: "2px solid #0b5ed7",
                  padding: "8px 12px",
                  borderRadius: 8,
                  fontWeight: 800,
                  fontSize: 14,
                  boxShadow: "0 2px 6px rgba(9,49,107,.2)",
                }}
              >
                ⬅️ Uploader Dashboard
              </button>
            )}

            {/* ✅ Assigner: CHỈ Exit, KHÔNG hiện nút quay về dashboard */}
            {isAssigner && (
              <button
                onClick={exit}
                title="Thoát về khu vực xếp chuỗi"
                style={{
                  background: "#fff7ed",
                  color: "#9a3412",
                  border: "1px solid #f59e0b",
                  padding: "8px 12px",
                  borderRadius: 8,
                  fontWeight: 800,
                  fontSize: 14,
                  boxShadow: "0 2px 6px rgba(0,0,0,.08)",
                }}
              >
                ⎋ Exit
              </button>
            )}
          </>
        )}
      </div>

      {/* Nội dung chính */}
      <nav style={{ display: "grid", gap: 8 }}>
        <Link href="/assign-chain" title="Xếp chuỗi thi (Assign chain)">
          Xếp chuỗi thi (Assign chain)
        </Link>

        {/* Hoặc dùng components/ui/logoutbutton.tsx của bạn */}
        <Link href="/logout" title="Đăng xuất">
          Đăng xuất
        </Link>
      </nav>

      {/* ⛔ Không render hint khi chưa biết role để tránh nhấp nháy */}
      {!loadingRole && (
        <div style={{ marginTop: 12 }}>
          {isAdmin && (
            <div
              style={{
                border: "1px solid #a7f3d0",
                background: "#ecfdf5",
                color: "#064e3b",
                borderRadius: 10,
                padding: 10,
                fontSize: 13.5,
              }}
            >
              Bạn đang đăng nhập bằng quyền <strong>Admin</strong>. Bạn có thể
              xếp chuỗi tại đây hoặc quay về Admin Dashboard.
            </div>
          )}

          {isUploader && (
            <div
              style={{
                border: "1px solid #a7f3d0",
                background: "#ecfdf5",
                color: "#064e3b",
                borderRadius: 10,
                padding: 10,
                fontSize: 13.5,
                marginTop: 8,
              }}
            >
              Bạn đang đăng nhập bằng quyền <strong>Uploader</strong>. Bạn có
              thể xếp chuỗi tại đây hoặc quay về Uploader Dashboard.
            </div>
          )}

          {isAssigner && (
            <div
              style={{
                border: "1px solid #bfdbfe",
                background: "#eff6ff",
                color: "#1e3a8a",
                borderRadius: 10,
                padding: 10,
                fontSize: 13.5,
                marginTop: 8,
              }}
            >
              Tài khoản của bạn chỉ dùng cho chức năng{" "}
              <strong>Assign chain</strong>. Khi xong, vui lòng bấm{" "}
              <strong>Exit</strong> để quay về khu vực xếp chuỗi.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
``
