
// app/dashboard/grader/page.tsx
import Link from 'next/link';
export default function GraderDashboard() {
  return (
    <div>
      <h1>Dashboard Grader</h1>
      <ul>
        <li>/gradingChấm điểm / Grading</Link></li>
        {/* Grader KHÔNG vào /results theo yêu cầu */}
      </ul>
    </div>
  );
}

// app/dashboard/uploader/page.tsx
import Link from 'next/link';
export default function UploaderDashboard() {
  return (
    <div>
      <h1>Dashboard Uploader</h1>
      <ul>
        <li>/upload-studentsUpload Sinh viên</Link></li>
        <li>/upload-rubricUpload Rubric</Link></li>
        <li>/manage-roundsQuản lý Đợt thi</Link></li>
        <li>/resultsKết quả</Link></li>
      </ul>
    </div>
  );
}

// app/dashboard/assigner/page.tsx
import Link from 'next/link';
export default function AssignerDashboard() {
  return (
    <div>
      <h1>Dashboard Assigner</h1>
      <ul>
        <li>/assign-chainXếp Chuỗi / Assign Chain</Link></li>
      </ul>
    </div>
  );
}
