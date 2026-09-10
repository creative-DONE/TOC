from typing import List, Any
import os
from datetime import datetime
from openpyxl import Workbook
from openpyxl.utils import get_column_letter
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from app.config import settings, EXPORTS_DIR

def generate_production_excel_report(schedules: List[Any], report_title: str = "Daily Production Schedule") -> str:
    """Generates an industrial-formatted Excel schedule report using openpyxl."""
    filename = f"production_schedule_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.xlsx"
    filepath = str(EXPORTS_DIR / filename)

    wb = Workbook()
    ws = wb.active
    ws.title = "Schedule"

    # Header styling
    header_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
    header_font = Font(name="Arial", size=11, bold=True, color="FFFFFF")
    title_font = Font(name="Arial", size=14, bold=True, color="1E3A8A")

    # Title row
    ws.merge_cells("A1:K1")
    ws["A1"] = f"{settings.PROJECT_NAME} — {report_title}"
    ws["A1"].font = title_font
    ws["A1"].alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 30

    headers = [
        "Slot ID", "Order #", "Customer", "Fabric", "Qty (kg)",
        "Colour", "Machine", "Operator", "Planned Start", "Planned End", "Freeze Status"
    ]
    ws.append([]) # Row 2 empty
    ws.append(headers) # Row 3
    ws.row_dimensions[3].height = 22

    for col_num in range(1, len(headers) + 1):
        cell = ws.cell(row=3, column=col_num)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")

    thin_border = Border(
        left=Side(style='thin', color='D1D5DB'),
        right=Side(style='thin', color='D1D5DB'),
        top=Side(style='thin', color='D1D5DB'),
        bottom=Side(style='thin', color='D1D5DB')
    )

    row_idx = 4
    for s in schedules:
        order = getattr(s, "order", None)
        cust_name = order.customer.name if (order and order.customer) else "Customer"
        cloth = order.cloth_type if order else "Cotton"
        qty = order.quantity_kg if order else 500.0
        col_name = order.colour_name if order else "Navy"
        ord_num = order.order_number if order else f"ORD-{s.order_id}"
        mach_name = s.machine.name if s.machine else f"Machine #{s.machine_id}"
        op_name = s.operator.name if s.operator else "Assigned Operator"
        start_str = s.planned_start.strftime("%d %b %H:%M") if s.planned_start else ""
        end_str = s.planned_end.strftime("%d %b %H:%M") if s.planned_end else ""

        ws.append([
            s.id, ord_num, cust_name, cloth, qty,
            col_name, mach_name, op_name, start_str, end_str, s.freeze_level
        ])

        for col_num in range(1, len(headers) + 1):
            cell = ws.cell(row=row_idx, column=col_num)
            cell.border = thin_border
            cell.alignment = Alignment(horizontal="center" if col_num in [1, 5, 9, 10, 11] else "left", vertical="center")
            if s.is_locked:
                cell.fill = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")

        row_idx += 1

    # Auto-adjust column widths
    for col_idx, col in enumerate(ws.columns, 1):
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = get_column_letter(col_idx)
        ws.column_dimensions[col_letter].width = max(max_len + 3, 12)

    wb.save(filepath)
    return filepath

def generate_production_pdf_report(schedules: List[Any], report_title: str = "Daily Production Schedule") -> str:
    """Generates an executive PDF production schedule dispatch document."""
    filename = f"production_report_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.pdf"
    filepath = str(EXPORTS_DIR / filename)

    doc = SimpleDocTemplate(filepath, pagesize=landscape(letter), leftMargin=30, rightMargin=30, topMargin=30, bottomMargin=30)
    styles = getSampleStyleSheet()
    story = []

    # Title
    title_style = ParagraphStyle(
        name="RepTitle",
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        textColor=colors.HexColor("#1E3A8A"),
        alignment=1
    )
    subtitle_style = ParagraphStyle(
        name="RepSub",
        fontName="Helvetica",
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#4B5563"),
        alignment=1
    )

    story.append(Paragraph(f"{settings.PROJECT_NAME}", title_style))
    story.append(Paragraph(f"{report_title} — Generated {datetime.utcnow().strftime('%d %B %Y, %H:%M UTC')}", subtitle_style))
    story.append(Spacer(1, 15))

    # Table Header
    table_data = [[
        "Slot", "Order #", "Customer", "Cloth", "Qty (kg)",
        "Colour", "Machine", "Planned Start", "Planned End", "Status"
    ]]

    for s in schedules[:40]: # Limit for clean PDF rendering
        order = getattr(s, "order", None)
        table_data.append([
            str(s.id),
            order.order_number if order else f"ORD-{s.order_id}",
            (order.customer.name[:15] + "..") if (order and order.customer and len(order.customer.name) > 15) else (order.customer.name if order and order.customer else "Direct"),
            order.cloth_type if order else "Cotton",
            f"{order.quantity_kg:.0f}" if order else "500",
            order.colour_name if order else "Navy",
            s.machine.code if s.machine else f"M{s.machine_id}",
            s.planned_start.strftime("%d %b %H:%M") if s.planned_start else "",
            s.planned_end.strftime("%d %b %H:%M") if s.planned_end else "",
            s.freeze_level
        ])

    table = Table(table_data, colWidths=[35, 75, 95, 75, 55, 75, 80, 85, 85, 65])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1E3A8A")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 6),
        ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor("#F9FAFB")),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#D1D5DB")),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#F3F4F6")])
    ]))

    story.append(table)
    doc.build(story)
    return filepath
