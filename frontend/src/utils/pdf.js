import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const A4 = { width: 210, height: 297 }; // mm
const MARGIN = 16;
const CONTENT_WIDTH = A4.width - MARGIN * 2;

// Colors lifted straight from the Tailwind palette the on-screen report
// uses, so the generated PDF reads as the same document instead of a
// generic export.
const SLATE_800 = [30, 41, 59];
const SLATE_600 = [71, 85, 105];
const SLATE_500 = [100, 116, 139];
const SLATE_400 = [148, 163, 184];
const SLATE_300 = [203, 213, 225];
const SLATE_100 = [241, 245, 249];
const EMERALD_700 = [4, 120, 87];
const EMERALD_50 = [236, 253, 245];
const RED_700 = [185, 28, 28];
const RED_50 = [254, 242, 242];
const AMBER_600 = [217, 119, 6];
const AMBER_50 = [255, 251, 235];

const STATUS_LABEL = {
  finalized: "Finalized",
  pending: "Pending review",
  rejected: "Rejected",
};

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function capitalizeFirst(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Draws one student's termly conduct report — header, incident table,
 * marks summary, termly status, Dean of Discipline sign-off — starting at the
 * PDF's current page. Mirrors ConductReportPaper.jsx's layout (same
 * sections, same order, same emphasis) but as native vector text/shapes
 * instead of a screenshot, so it stays crisp and matches the app's fonts
 * and colors exactly rather than depending on how a browser happens to
 * rasterize it.
 */
function drawConductReportPage(pdf, report) {
  const { school, class: klass, academicYear, term, student, score, status, incidents, deanOfDiscipline } = report;
  const percent = Math.max(0, Math.round((score.remaining / score.maxMarks) * 100));
  const good = status === "good";

  let y = MARGIN + 5;

  // Header: school/class/term/student block on the left, date on the right.
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.setTextColor(...SLATE_800);
  pdf.text(school.name.toUpperCase(), MARGIN, y);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.text("Date", A4.width - MARGIN, y, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.text(formatDate(report.generatedAt), A4.width - MARGIN, y + 4.5, { align: "right" });

  y += 6;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);

  const headerLines = [
    ["Class: ", klass.name],
    ["Academic Year: ", academicYear.name],
    ["Term: ", term.name],
    ["Student: ", `${student.firstName} ${student.lastName}${student.admissionNumber ? ` (${student.admissionNumber})` : ""}`],
  ];
  if (student.guardianName || student.guardianPhone) {
    headerLines.push(["Guardian: ", `${student.guardianName || "—"}${student.guardianPhone ? ` — ${student.guardianPhone}` : ""}`]);
  }
  headerLines.forEach(([label, value]) => {
    pdf.setFont("helvetica", "bold");
    const labelWidth = pdf.getTextWidth(label);
    pdf.text(label, MARGIN, y);
    pdf.setFont("helvetica", "normal");
    pdf.text(value, MARGIN + labelWidth, y);
    y += 4.6;
  });

  y += 1.5;
  pdf.setDrawColor(...SLATE_800);
  pdf.setLineWidth(0.6);
  pdf.line(MARGIN, y, A4.width - MARGIN, y);
  y += 9;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12.5);
  pdf.setTextColor(...SLATE_800);
  pdf.text(`TERMLY CONDUCT REPORT — ${term.name.toUpperCase()}`, A4.width / 2, y, { align: "center" });
  y += 6;

  // Incident table.
  const rows =
    incidents.length === 0
      ? [["", "", "No incidents recorded this term.", "", "", "", ""]]
      : incidents.map((i, idx) => {
          let incidentCell = i.title;
          if (i.description) incidentCell += `\n${i.description}`;
          if (i.sentHomeFrom) incidentCell += `\nSent home: ${formatDate(i.sentHomeFrom)} – ${formatDate(i.sentHomeTo)}`;
          return [
            String(idx + 1),
            formatDate(i.date),
            incidentCell,
            i.severity ? capitalizeFirst(i.severity) : "—",
            STATUS_LABEL[i.status] || i.status,
            i.status === "finalized" ? `-${i.marksDeducted}` : "—",
            i.status === "finalized" ? i.finalizedBy || "—" : "—",
          ];
        });

  autoTable(pdf, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [["#", "Date", "Incident", "Severity", "Status", "Marks", "Approved by"]],
    body: rows,
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 8,
      textColor: SLATE_800,
      lineColor: SLATE_300,
      lineWidth: 0.2,
      cellPadding: 1.8,
      valign: "top",
    },
    headStyles: {
      fillColor: SLATE_100,
      textColor: SLATE_800,
      fontStyle: "bold",
      lineColor: SLATE_300,
    },
    columnStyles: {
      0: { cellWidth: 7 },
      1: { cellWidth: 18 },
      2: { cellWidth: "auto" },
      3: { cellWidth: 18 },
      4: { cellWidth: 22 },
      5: { cellWidth: 14, halign: "center" },
      6: { cellWidth: 24 },
    },
    didParseCell: (data) => {
      if (incidents.length === 0 && data.column.index !== 2) data.cell.text = [];
      if (incidents.length === 0 && data.column.index === 2) {
        data.cell.styles.halign = "center";
        data.cell.styles.textColor = SLATE_500;
        data.cell.colSpan = 7;
      }
      // columnStyles.halign only applies to body cells in jspdf-autotable,
      // not the head row, so the "Marks" header needs centering here too.
      if (data.section === "head" && data.column.index === 5) {
        data.cell.styles.halign = "center";
      }
    },
  });

  y = pdf.lastAutoTable.finalY + 7;

  // Marks summary + termly status box.
  const boxHeight = 32;
  pdf.setDrawColor(...SLATE_800);
  pdf.setLineWidth(0.5);
  pdf.rect(MARGIN, y, CONTENT_WIDTH, boxHeight);

  const colWidth = CONTENT_WIDTH / 3;
  const summary = [
    ["Total marks", String(score.maxMarks)],
    ["Marks deducted", String(score.deducted)],
    ["Remaining marks", `${score.remaining} / ${score.maxMarks} (${percent}%)`],
  ];
  summary.forEach(([label, value], idx) => {
    const colX = MARGIN + 4 + idx * colWidth;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(...SLATE_500);
    pdf.text(label, colX, y + 7);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(...SLATE_800);
    pdf.text(value, colX, y + 13);
  });

  pdf.setDrawColor(...SLATE_300);
  pdf.setLineWidth(0.2);
  pdf.line(MARGIN + 3, y + 17, MARGIN + CONTENT_WIDTH - 3, y + 17);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(...SLATE_600);
  pdf.text(`Status: remaining marks ${good ? "at or above" : "below"} 50% of the term total.`, MARGIN + 4, y + 22.5);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.setTextColor(...(good ? EMERALD_700 : AMBER_600));
  pdf.text(good ? "GOOD" : "AT RISK", MARGIN + CONTENT_WIDTH - 4, y + 22.5, { align: "right" });

  pdf.setFont("helvetica", "italic");
  pdf.setFontSize(7.5);
  pdf.setTextColor(...SLATE_500);
  pdf.text(
    "This is a termly status only — the promotion/dismissal decision is made at year end, combining all three terms.",
    MARGIN + 4,
    y + 28
  );

  y += boxHeight + 12;

  // Dean of Discipline sign-off — pinned near the bottom of the page unless
  // the content above already runs past that point.
  const footerY = Math.max(y, A4.height - MARGIN - 12);
  pdf.setDrawColor(...SLATE_400);
  pdf.setLineWidth(0.3);
  pdf.line(MARGIN, footerY, MARGIN + 60, footerY);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...SLATE_600);
  pdf.text("Dean of Discipline signature", MARGIN, footerY + 4);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.setTextColor(...SLATE_800);
  pdf.text(deanOfDiscipline?.name || "Dean of Discipline", A4.width - MARGIN, footerY, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(...SLATE_500);
  pdf.text(deanOfDiscipline?.email || "—", A4.width - MARGIN, footerY + 4, { align: "right" });
}

/**
 * Draws one student's yearly conduct report — term-by-term breakdown, the
 * combined yearly total, and the promotion/dismissal decision. Mirrors
 * YearlyConductReportPaper.jsx's layout.
 */
function drawYearlyReportPage(pdf, report) {
  const { school, class: klass, academicYear, student, terms, year, deanOfDiscipline } = report;
  const percent = Math.max(0, Math.round((year.remaining / year.maxMarks) * 100));
  const promoted = year.decision === "promoted";

  let y = MARGIN + 5;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.setTextColor(...SLATE_800);
  pdf.text(school.name.toUpperCase(), MARGIN, y);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.text("Date", A4.width - MARGIN, y, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.text(formatDate(report.generatedAt), A4.width - MARGIN, y + 4.5, { align: "right" });

  y += 6;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);

  const headerLines = [
    ["Class: ", klass.name],
    ["Academic Year: ", academicYear.name],
    ["Student: ", `${student.firstName} ${student.lastName}${student.admissionNumber ? ` (${student.admissionNumber})` : ""}`],
  ];
  if (student.guardianName || student.guardianPhone) {
    headerLines.push(["Guardian: ", `${student.guardianName || "—"}${student.guardianPhone ? ` — ${student.guardianPhone}` : ""}`]);
  }
  headerLines.forEach(([label, value]) => {
    pdf.setFont("helvetica", "bold");
    const labelWidth = pdf.getTextWidth(label);
    pdf.text(label, MARGIN, y);
    pdf.setFont("helvetica", "normal");
    pdf.text(value, MARGIN + labelWidth, y);
    y += 4.6;
  });

  y += 1.5;
  pdf.setDrawColor(...SLATE_800);
  pdf.setLineWidth(0.6);
  pdf.line(MARGIN, y, A4.width - MARGIN, y);
  y += 9;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12.5);
  pdf.setTextColor(...SLATE_800);
  pdf.text(`YEARLY CONDUCT REPORT — ${academicYear.name.toUpperCase()}`, A4.width / 2, y, { align: "center" });
  y += 6;

  const rows = terms.map((t) => [t.termName, String(t.maxMarks), String(t.deducted), String(t.remaining)]);
  rows.push(["Total", String(year.maxMarks), String(year.deducted), String(year.remaining)]);

  autoTable(pdf, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [["Term", "Max marks", "Deducted", "Remaining"]],
    body: rows,
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 9.5,
      textColor: SLATE_800,
      lineColor: SLATE_300,
      lineWidth: 0.2,
      cellPadding: 2.2,
      halign: "center",
    },
    headStyles: {
      fillColor: SLATE_100,
      textColor: SLATE_800,
      fontStyle: "bold",
      lineColor: SLATE_300,
    },
    columnStyles: {
      0: { halign: "left", cellWidth: "auto" },
    },
    didParseCell: (data) => {
      if (data.row.index === rows.length - 1) {
        data.cell.styles.fillColor = SLATE_100;
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  y = pdf.lastAutoTable.finalY + 7;

  const boxHeight = 32;
  pdf.setDrawColor(...SLATE_800);
  pdf.setLineWidth(0.5);
  pdf.rect(MARGIN, y, CONTENT_WIDTH, boxHeight);

  const colWidth = CONTENT_WIDTH / 3;
  const summary = [
    ["Total marks", String(year.maxMarks)],
    ["Marks deducted", String(year.deducted)],
    ["Remaining marks", `${year.remaining} / ${year.maxMarks} (${percent}%)`],
  ];
  summary.forEach(([label, value], idx) => {
    const colX = MARGIN + 4 + idx * colWidth;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(...SLATE_500);
    pdf.text(label, colX, y + 7);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(...SLATE_800);
    pdf.text(value, colX, y + 13);
  });

  pdf.setDrawColor(...SLATE_300);
  pdf.setLineWidth(0.2);
  pdf.line(MARGIN + 3, y + 17, MARGIN + CONTENT_WIDTH - 3, y + 17);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(...SLATE_600);
  pdf.text(`Decision: remaining marks ${promoted ? "at or above" : "below"} 50% of the year total.`, MARGIN + 4, y + 22.5);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(...(promoted ? EMERALD_700 : [185, 28, 28]));
  pdf.text(promoted ? "PROMOTED" : "DISMISSED", MARGIN + CONTENT_WIDTH - 4, y + 22.5, { align: "right" });

  y += boxHeight + 12;

  const footerY = Math.max(y, A4.height - MARGIN - 12);
  pdf.setDrawColor(...SLATE_400);
  pdf.setLineWidth(0.3);
  pdf.line(MARGIN, footerY, MARGIN + 60, footerY);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...SLATE_600);
  pdf.text("Dean of Discipline signature", MARGIN, footerY + 4);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.setTextColor(...SLATE_800);
  pdf.text(deanOfDiscipline?.name || "Dean of Discipline", A4.width - MARGIN, footerY, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(...SLATE_500);
  pdf.text(deanOfDiscipline?.email || "—", A4.width - MARGIN, footerY + 4, { align: "right" });
}

/**
 * Builds the "Yearly report" PDF: every active student's full year-end
 * conduct report (term breakdown + decision), one per page.
 */
export function exportYearlyReportPdf(reports, filename) {
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  reports.forEach((report, idx) => {
    if (idx > 0) pdf.addPage();
    drawYearlyReportPage(pdf, report);
  });
  pdf.save(filename);
}

/**
 * Builds the "Yearly decisions" PDF — student name, remaining yearly marks,
 * and the promoted/dismissed decision, no per-term detail — for a quick
 * end-of-year sign-off list.
 */
export function exportYearlyDecisionsPdf({ school, klass, academicYear, deanOfDiscipline, students }, filename) {
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  let y = MARGIN + 5;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.setTextColor(...SLATE_800);
  pdf.text(school.name.toUpperCase(), MARGIN, y);
  y += 6;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);
  [
    ["Class: ", klass.name],
    ["Academic Year: ", academicYear.name],
  ].forEach(([label, value]) => {
    pdf.setFont("helvetica", "bold");
    const labelWidth = pdf.getTextWidth(label);
    pdf.text(label, MARGIN, y);
    pdf.setFont("helvetica", "normal");
    pdf.text(value, MARGIN + labelWidth, y);
    y += 4.6;
  });

  y += 1.5;
  pdf.setDrawColor(...SLATE_800);
  pdf.setLineWidth(0.6);
  pdf.line(MARGIN, y, A4.width - MARGIN, y);
  y += 9;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(...SLATE_800);
  pdf.text("YEARLY CONDUCT DECISIONS", A4.width / 2, y, { align: "center" });
  y += 6;

  autoTable(pdf, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN, bottom: MARGIN + 16 },
    head: [["#", "Student", "Remaining", "Decision"]],
    body: students.map((s, idx) => [
      String(idx + 1),
      `${s.firstName} ${s.lastName}`,
      `${s.year.remaining} / ${s.year.maxMarks}`,
      s.year.decision === "promoted" ? "Promoted" : "Dismissed",
    ]),
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 9.5,
      textColor: SLATE_800,
      lineColor: SLATE_300,
      lineWidth: 0.2,
      cellPadding: 2.2,
    },
    headStyles: {
      fillColor: SLATE_100,
      textColor: SLATE_800,
      fontStyle: "bold",
      lineColor: SLATE_300,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 28, halign: "center" },
      3: { cellWidth: 28, halign: "center" },
    },
    didParseCell: (data) => {
      // columnStyles.halign only applies to body cells in jspdf-autotable,
      // not the head row.
      if (data.section === "head" && (data.column.index === 2 || data.column.index === 3)) {
        data.cell.styles.halign = "center";
      }
      if (data.section === "body" && data.column.index === 3) {
        data.cell.styles.textColor = data.cell.raw === "Promoted" ? EMERALD_700 : [185, 28, 28];
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  const pageCount = pdf.internal.getNumberOfPages();
  pdf.setPage(pageCount);
  const footerY = A4.height - MARGIN;
  pdf.setDrawColor(...SLATE_400);
  pdf.setLineWidth(0.3);
  pdf.line(MARGIN, footerY - 10, MARGIN + 60, footerY - 10);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...SLATE_600);
  pdf.text("Dean of Discipline signature", MARGIN, footerY - 6);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(...SLATE_800);
  pdf.text(deanOfDiscipline?.name || "Dean of Discipline", A4.width - MARGIN, footerY - 6, { align: "right" });

  pdf.save(filename);
}

const DISMISSAL_LABEL = {
  dismissed_permanently: "Dismissed permanently",
  dismissed_term: "Dismissed (term)",
};

/**
 * Builds the "Dismissed students" PDF — every dismissed student for the
 * chosen academic year (optionally narrowed to one term and/or one
 * dismissal kind), with which term/class they were dismissed from, the
 * reason, and who decided it. Mirrors exportYearlyDecisionsPdf's layout
 * (single table, sign-off footer) since it's the same kind of flat
 * decisions list, just school-wide instead of one class.
 */
export function exportDismissedStudentsPdf({ school, academicYear, termLabel, deanOfDiscipline, students }, filename) {
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const pageWidth = A4.height; // landscape: width/height swapped
  let y = MARGIN + 5;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.setTextColor(...SLATE_800);
  pdf.text(school.name.toUpperCase(), MARGIN, y);
  y += 6;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);
  [
    ["Academic Year: ", academicYear.name],
    ["Term: ", termLabel || "All terms"],
  ].forEach(([label, value]) => {
    pdf.setFont("helvetica", "bold");
    const labelWidth = pdf.getTextWidth(label);
    pdf.text(label, MARGIN, y);
    pdf.setFont("helvetica", "normal");
    pdf.text(value, MARGIN + labelWidth, y);
    y += 4.6;
  });

  y += 1.5;
  pdf.setDrawColor(...SLATE_800);
  pdf.setLineWidth(0.6);
  pdf.line(MARGIN, y, pageWidth - MARGIN, y);
  y += 9;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(...SLATE_800);
  pdf.text("DISMISSED STUDENTS", pageWidth / 2, y, { align: "center" });
  y += 6;

  autoTable(pdf, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN, bottom: MARGIN + 16 },
    head: [["#", "Student", "Admission No.", "Class", "Term", "Decision", "Decided by", "Date"]],
    body: students.map((s, idx) => [
      String(idx + 1),
      `${s.firstName} ${s.lastName}`,
      s.admissionNumber || "—",
      s.className || "—",
      s.termName || "—",
      DISMISSAL_LABEL[s.decision] || s.decision,
      s.decidedBy || "—",
      formatDate(s.decidedAt),
    ]),
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 9,
      textColor: SLATE_800,
      lineColor: SLATE_300,
      lineWidth: 0.2,
      cellPadding: 2.2,
    },
    headStyles: {
      fillColor: SLATE_100,
      textColor: SLATE_800,
      fontStyle: "bold",
      lineColor: SLATE_300,
    },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      5: { halign: "center" },
      7: { halign: "center" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 5) {
        data.cell.styles.textColor = data.cell.raw === DISMISSAL_LABEL.dismissed_permanently ? RED_700 : AMBER_600;
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  const pageCount = pdf.internal.getNumberOfPages();
  pdf.setPage(pageCount);
  const footerY = A4.width - MARGIN; // A4.width doubles as landscape page height
  pdf.setDrawColor(...SLATE_400);
  pdf.setLineWidth(0.3);
  pdf.line(MARGIN, footerY - 10, MARGIN + 60, footerY - 10);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...SLATE_600);
  pdf.text("Dean of Discipline signature", MARGIN, footerY - 6);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(...SLATE_800);
  pdf.text(deanOfDiscipline?.name || "Dean of Discipline", pageWidth - MARGIN, footerY - 6, { align: "right" });

  pdf.save(filename);
}

/**
 * Builds the "Conduct report" PDF: every active student's termly report,
 * one per page (same as the old print-all layout), and triggers the
 * download.
 */
export function exportConductReportPdf(reports, filename) {
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  reports.forEach((report, idx) => {
    if (idx > 0) pdf.addPage();
    drawConductReportPage(pdf, report);
  });
  pdf.save(filename);
}

/** Inclusive day count between two date strings, e.g. Fri–Sun = 3 days. */
function inclusiveDayCount(from, to) {
  const start = new Date(from);
  const end = new Date(to);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  const days = Math.round((end - start) / 86400000) + 1;
  return Math.max(1, days);
}

/**
 * Builds the "Weekend Permission" slip for one approved send-home
 * record — school letterhead, student name, reason, how many days
 * they're to stay home and when they're expected back, and a Dean of
 * Discipline signature line. Meant to be printed and handed to the
 * student/guardian as proof the absence is authorized.
 */
export function exportWeekendPermissionPdf(data, filename) {
  const { school, student, reason, sentHomeFrom, sentHomeTo, deanOfDiscipline } = data;
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  let y = MARGIN + 6;

  // Letterhead: school name, then address/phone/email underneath in a
  // smaller, muted line — whichever of those the school actually has on
  // file (all three are optional on the reference record).
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.setTextColor(...SLATE_800);
  pdf.text(school.name.toUpperCase(), A4.width / 2, y, { align: "center" });
  y += 6;

  const contactLine = [school.address, school.phone, school.email].filter(Boolean).join("   •   ");
  if (contactLine) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(...SLATE_500);
    pdf.text(contactLine, A4.width / 2, y, { align: "center" });
    y += 6;
  }

  y += 2;
  pdf.setDrawColor(...SLATE_800);
  pdf.setLineWidth(0.6);
  pdf.line(MARGIN, y, A4.width - MARGIN, y);
  y += 10;

  // Status stamp — the one clear signal of whether this slip still proves
  // an active, authorized absence (VALID) or is now just a record of one
  // that's already over (EXPIRED). Kept downloadable either way; this is
  // what tells the reader which case they're holding.
  const isExpired = !!data.isExpired;
  const stampColor = isExpired ? AMBER_600 : EMERALD_700;
  const stampFill = isExpired ? AMBER_50 : EMERALD_50;
  const stampLabel = isExpired ? "EXPIRED" : "VALID";
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  const stampTextWidth = pdf.getTextWidth(stampLabel);
  const stampPaddingX = 5;
  const stampWidth = stampTextWidth + stampPaddingX * 2;
  const stampHeight = 8;
  const stampX = A4.width - MARGIN - stampWidth;
  const stampY = y - stampHeight;
  pdf.setFillColor(...stampFill);
  pdf.setDrawColor(...stampColor);
  pdf.setLineWidth(0.5);
  pdf.roundedRect(stampX, stampY, stampWidth, stampHeight, 1.5, 1.5, "FD");
  pdf.setTextColor(...stampColor);
  // Centered both horizontally (align: center on the box's midpoint) and
  // vertically ("middle" baseline against the box's own vertical midpoint).
  pdf.text(stampLabel, stampX + stampWidth / 2, stampY + stampHeight / 2, { align: "center", baseline: "middle" });
  y += 6;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  pdf.setTextColor(...SLATE_800);
  pdf.text("WEEKEND PERMISSION", A4.width / 2, y, { align: "center" });
  y += 4;
  pdf.setDrawColor(...SLATE_300);
  pdf.setLineWidth(0.3);
  pdf.line(A4.width / 2 - 28, y, A4.width / 2 + 28, y);
  y += 14;

  const days = inclusiveDayCount(sentHomeFrom, sentHomeTo);
  const studentName = `${student.firstName} ${student.lastName}${student.admissionNumber ? ` (${student.admissionNumber})` : ""}`;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.setTextColor(...SLATE_600);
  const intro = `This confirms that the student named below has been granted permission to leave school and stay home, as decided by the discipline office.`;
  const introLines = pdf.splitTextToSize(intro, CONTENT_WIDTH);
  pdf.text(introLines, MARGIN, y);
  y += introLines.length * 5.5 + 8;

  const rows = [
    ["Student", studentName],
    ["Reason", capitalizeFirst(reason)],
    ["Days to stay home", `${days} day${days === 1 ? "" : "s"}`],
    ["Sent home from", formatDate(sentHomeFrom)],
    ["Expected to return", formatDate(sentHomeTo)],
  ];
  const labelWidth = 42;
  pdf.setTextColor(0, 0, 0);
  rows.forEach(([label, value]) => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.text(label.toUpperCase(), MARGIN, y);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9.5);
    pdf.text(value, MARGIN + labelWidth, y);
    y += 6;
  });

  y += 6;
  pdf.setFont("helvetica", "italic");
  pdf.setFontSize(9.5);
  pdf.setTextColor(...SLATE_600);
  const closing = "The bearer should carry this slip and present it if asked to confirm the absence is authorized. It must be returned, signed, on the student's return to school.";
  const closingLines = pdf.splitTextToSize(closing, CONTENT_WIDTH);
  pdf.text(closingLines, MARGIN, y);
  y += closingLines.length * 5 + 16;

  // Dean of Discipline sign-off — right under the closing message, not
  // pinned to the bottom of the page.
  const footerY = y;
  pdf.setDrawColor(...SLATE_400);
  pdf.setLineWidth(0.3);
  pdf.line(MARGIN, footerY, MARGIN + 65, footerY);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...SLATE_600);
  pdf.text("Dean of Discipline — name & signature", MARGIN, footerY + 4.5);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10.5);
  pdf.setTextColor(...SLATE_800);
  pdf.text(deanOfDiscipline?.name || "Dean of Discipline", A4.width - MARGIN, footerY, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(...SLATE_500);
  pdf.text(formatDate(new Date()), A4.width - MARGIN, footerY + 4.5, { align: "right" });

  pdf.save(filename);
}

/**
 * Builds the "Conduct marks" PDF — student name + remaining marks only, no
 * incident detail — for when the Dean just needs the numbers at a glance.
 * Header block (school/class/term), a bordered table, and the Dean of
 * Discipline's name pinned to the bottom of the page. Paginates
 * automatically for larger classes, repeating the table header.
 */
export function exportConductMarksPdf({ school, klass, academicYear, term, deanOfDiscipline, students }, filename) {
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  let y = MARGIN + 5;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.setTextColor(...SLATE_800);
  pdf.text(school.name.toUpperCase(), MARGIN, y);
  y += 6;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);
  [
    ["Class: ", klass.name],
    ["Academic Year: ", academicYear.name],
    ["Term: ", term.name],
  ].forEach(([label, value]) => {
    pdf.setFont("helvetica", "bold");
    const labelWidth = pdf.getTextWidth(label);
    pdf.text(label, MARGIN, y);
    pdf.setFont("helvetica", "normal");
    pdf.text(value, MARGIN + labelWidth, y);
    y += 4.6;
  });

  y += 1.5;
  pdf.setDrawColor(...SLATE_800);
  pdf.setLineWidth(0.6);
  pdf.line(MARGIN, y, A4.width - MARGIN, y);
  y += 9;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(...SLATE_800);
  pdf.text("CONDUCT MARKS LIST", A4.width / 2, y, { align: "center" });
  y += 6;

  autoTable(pdf, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN, bottom: MARGIN + 16 },
    head: [["#", "Student", "Marks"]],
    body: students.map((s, idx) => [String(idx + 1), `${s.student.firstName} ${s.student.lastName}`, String(s.score.remaining)]),
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 9.5,
      textColor: SLATE_800,
      lineColor: SLATE_300,
      lineWidth: 0.2,
      cellPadding: 2.2,
    },
    headStyles: {
      fillColor: SLATE_100,
      textColor: SLATE_800,
      fontStyle: "bold",
      lineColor: SLATE_300,
    },
    columnStyles: {
      0: { cellWidth: 12 },
      1: { cellWidth: "auto" },
      2: { cellWidth: 30, halign: "center" },
    },
    didParseCell: (data) => {
      // columnStyles.halign only applies to body cells in jspdf-autotable,
      // not the head row, so the "Marks" header has to be centered here to
      // match the centered values beneath it.
      if (data.section === "head" && data.column.index === 2) {
        data.cell.styles.halign = "center";
      }
    },
  });

  // Dean of Discipline sign-off, pinned to the bottom of the last page.
  const pageCount = pdf.internal.getNumberOfPages();
  pdf.setPage(pageCount);
  const footerY = A4.height - MARGIN;
  pdf.setDrawColor(...SLATE_400);
  pdf.setLineWidth(0.3);
  pdf.line(MARGIN, footerY - 10, MARGIN + 60, footerY - 10);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...SLATE_600);
  pdf.text("Dean of Discipline signature", MARGIN, footerY - 6);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(...SLATE_800);
  pdf.text(deanOfDiscipline?.name || "Dean of Discipline", A4.width - MARGIN, footerY - 6, { align: "right" });

  pdf.save(filename);
}
