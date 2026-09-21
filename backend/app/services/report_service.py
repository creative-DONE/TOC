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

def generate_production_excel_report(schedules: List[Any], report_title: str = "Production Planning Matrix", db: Any = None) -> str:
    """
    Generates an industrial-formatted Excel schedule report using openpyxl.
    Formatted as the PRODUCTION PLANNING MATRIX:
    - Left side: Order Number, Quantity (kg), Planned Day
    - Right side: Merged 'WORK' header spanning dynamic machine columns
    - Assigned cells contain the Order Number
    - Includes secondary 'Detailed Slots' sheet.
    """
    filename = f"production_planning_matrix_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.xlsx"
    filepath = str(EXPORTS_DIR / filename)

    wb = Workbook()

    # =========================================================================
    # SHEET 1: PRODUCTION PLANNING MATRIX
    # =========================================================================
    ws_matrix = wb.active
    ws_matrix.title = "Planning Matrix"

    # Styling definitions
    title_fill = PatternFill(start_color="0B1329", end_color="0B1329", fill_type="solid")
    title_font = Font(name="Arial", size=13, bold=True, color="06B6D4")

    work_super_fill = PatternFill(start_color="0369A1", end_color="0369A1", fill_type="solid")
    work_super_font = Font(name="Arial", size=11, bold=True, color="FFFFFF")

    order_super_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    order_super_font = Font(name="Arial", size=10, bold=True, color="94A3B8")

    col_header_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
    col_header_font = Font(name="Arial", size=9, bold=True, color="FFFFFF")

    mach_header_fill = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid")
    mach_header_font = Font(name="Arial", size=9, bold=True, color="38BDF8")

    assigned_cell_fill = PatternFill(start_color="E0F2FE", end_color="E0F2FE", fill_type="solid")
    assigned_cell_font = Font(name="Arial", size=10, bold=True, color="0369A1")

    locked_cell_fill = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")
    locked_cell_font = Font(name="Arial", size=10, bold=True, color="B45309")

    thin_border = Border(
        left=Side(style='thin', color='CBD5E1'),
        right=Side(style='thin', color='CBD5E1'),
        top=Side(style='thin', color='CBD5E1'),
        bottom=Side(style='thin', color='CBD5E1')
    )

    # Gather machines and orders
    machines = []
    orders = []

    if db:
        from app.models.factory_models import Machine
        from app.models.order_models import Order
        machines = db.query(Machine).order_by(Machine.id.asc()).all()
        orders = db.query(Order).filter(Order.status.not_in(["CANCELLED", "COMPLETED"])).order_by(Order.id.asc()).all()
    else:
        mach_dict = {}
        ord_dict = {}
        for s in schedules:
            if s.machine and s.machine.id not in mach_dict:
                mach_dict[s.machine.id] = s.machine
            if s.order and s.order.id not in ord_dict:
                ord_dict[s.order.id] = s.order
        machines = sorted(mach_dict.values(), key=lambda m: m.id)
        orders = sorted(ord_dict.values(), key=lambda o: o.id)

    num_machines = max(1, len(machines))
    total_cols = 4 + num_machines

    # Title Row (Row 1)
    end_col_letter = get_column_letter(total_cols)
    ws_matrix.merge_cells(f"A1:{end_col_letter}1")
    title_cell = ws_matrix["A1"]
    title_cell.value = f"PRIME TEXTILES — {report_title} (TOC DBR v2.0)"
    title_cell.font = title_font
    title_cell.fill = title_fill
    title_cell.alignment = Alignment(horizontal="center", vertical="center")
    ws_matrix.row_dimensions[1].height = 32

    # Super Headers (Row 3): A3:D3 = "ORDER SPECIFICATIONS", E3:EndCol = "WORK"
    ws_matrix.append([]) # Row 2 empty
    ws_matrix.row_dimensions[2].height = 8

    # Add row 3
    row3_vals = ["ORDER SPECIFICATIONS", "", "", ""] + ["WORK"] + [""] * (num_machines - 1)
    ws_matrix.append(row3_vals)
    ws_matrix.row_dimensions[3].height = 22

    ws_matrix.merge_cells("A3:D3")
    for col_idx in range(1, 5):
        c = ws_matrix.cell(row=3, column=col_idx)
        c.fill = order_super_fill
        c.font = order_super_font
        c.alignment = Alignment(horizontal="center", vertical="center")
        c.border = thin_border

    work_start_letter = get_column_letter(5)
    if num_machines > 1:
        ws_matrix.merge_cells(f"{work_start_letter}3:{end_col_letter}3")
    for col_idx in range(5, total_cols + 1):
        c = ws_matrix.cell(row=3, column=col_idx)
        c.fill = work_super_fill
        c.font = work_super_font
        c.alignment = Alignment(horizontal="center", vertical="center")
        c.border = thin_border

    # Sub Headers (Row 4): Order Number, Quantity (kg), Due Date, Planned Day, then machine columns
    row4_headers = ["Order Number", "Quantity (kg)", "Due Date", "Planned Day"]
    for m in machines:
        row4_headers.append(f"{m.code}\n(Cap: {m.max_batch_kg:.0f}kg)")

    ws_matrix.append(row4_headers)
    ws_matrix.row_dimensions[4].height = 28

    for col_idx in range(1, 5):
        c = ws_matrix.cell(row=4, column=col_idx)
        c.fill = col_header_fill
        c.font = col_header_font
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = thin_border

    for col_idx in range(5, total_cols + 1):
        c = ws_matrix.cell(row=4, column=col_idx)
        c.fill = mach_header_fill
        c.font = mach_header_font
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = thin_border

    # Build order slot mapping: order_id -> list of slots
    order_slots_map = {}
    for s in schedules:
        order_slots_map.setdefault(s.order_id, []).append(s)

    now = datetime.utcnow()
    today_midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Populate Data Rows (Row 5+)
    row_idx = 5
    for o in orders:
        o_slots = order_slots_map.get(o.id, [])
        earliest_start = min([s.planned_start for s in o_slots if s.planned_start], default=o.planned_start)
        day_str = "Day 1 (Today)"
        if earliest_start:
            day_diff = (earliest_start.replace(hour=0, minute=0, second=0, microsecond=0) - today_midnight).days
            day_num = max(1, day_diff + 1)
            day_str = f"Day {day_num}" if day_num > 1 else "Day 1 (Today)"

        due_str = "Day 7"
        if o.due_date:
            due_diff = (o.due_date.replace(hour=0, minute=0, second=0, microsecond=0) - today_midnight).days
            due_str = f"Day {max(1, due_diff + 1)}"

        # Short order number
        parts = o.order_number.split('-')
        short_num = parts[-1] if len(parts) > 1 and parts[-1].isdigit() else o.order_number

        row_data = [o.order_number, round(o.quantity_kg, 1), due_str, day_str]

        # Machine columns: if assigned, fill with order number and allocated quantity
        for m in machines:
            mach_slot = next((s for s in o_slots if s.machine_id == m.id), None)
            if mach_slot:
                slot_w = mach_slot.batch.batch_quantity_kg if (mach_slot.batch and mach_slot.batch.batch_quantity_kg) else o.quantity_kg
                row_data.append(f"{short_num}\n{slot_w:.0f} kg")
            else:
                row_data.append("")

        ws_matrix.append(row_data)
        ws_matrix.row_dimensions[row_idx].height = 28

        # Style cells
        for col_idx in range(1, total_cols + 1):
            cell = ws_matrix.cell(row=row_idx, column=col_idx)
            cell.border = thin_border
            if col_idx == 1:
                cell.alignment = Alignment(horizontal="center", vertical="center")
                cell.font = Font(name="Arial", size=9, bold=True, color="0F172A")
            elif col_idx == 2:
                cell.alignment = Alignment(horizontal="right", vertical="center")
                cell.font = Font(name="Arial", size=9, bold=True, color="0F172A")
            elif col_idx == 3:
                cell.alignment = Alignment(horizontal="center", vertical="center")
                cell.font = Font(name="Arial", size=9, color="475569")
            else:
                # Machine cell
                m_idx = col_idx - 4
                m = machines[m_idx] if m_idx < len(machines) else None
                mach_slot = next((s for s in o_slots if s.machine_id == m.id), None) if m else None
                if mach_slot:
                    cell.alignment = Alignment(horizontal="center", vertical="center")
                    if mach_slot.is_locked:
                        cell.fill = locked_cell_fill
                        cell.font = locked_cell_font
                    else:
                        cell.fill = assigned_cell_fill
                        cell.font = assigned_cell_font
                else:
                    cell.alignment = Alignment(horizontal="center", vertical="center")

        row_idx += 1

    # Machine Fleet Parameters & Standardized Utilization Summary
    ws_matrix.append([])
    ws_matrix.append([])
    summary_title_row = row_idx + 2
    ws_matrix.merge_cells(f"A{summary_title_row}:L{summary_title_row}")
    sum_title_cell = ws_matrix[f"A{summary_title_row}"]
    sum_title_cell.value = "FLEET PARAMETERS & REAL PRODUCTION TIME UTILIZATION SUMMARY"
    sum_title_cell.font = Font(name="Arial", size=11, bold=True, color="FFFFFF")
    sum_title_cell.fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
    sum_title_cell.alignment = Alignment(horizontal="center", vertical="center")
    ws_matrix.row_dimensions[summary_title_row].height = 24

    sum_headers = [
        "Machine Code", "Machine Name", "Capacity (kg/batch)", "Loading (hr)", "Processing (hr)",
        "Unloading (hr)", "Cleaning (hr)", "Shift (hr/day)", "Scheduled Load (kg)", "Scheduled Time (hr)",
        "Maintenance (hr)", "Utilization %"
    ]
    ws_matrix.append(sum_headers)
    ws_matrix.row_dimensions[summary_title_row + 1].height = 22
    for c_i in range(1, len(sum_headers) + 1):
        c = ws_matrix.cell(row=summary_title_row + 1, column=c_i)
        c.fill = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid")
        c.font = Font(name="Arial", size=9, bold=True, color="38BDF8")
        c.alignment = Alignment(horizontal="center", vertical="center")
        c.border = thin_border

    # Fetch maintenances if db
    maints = []
    if db:
        from app.models.factory_models import MachineMaintenance
        from datetime import timedelta
        maints = db.query(MachineMaintenance).filter(
            MachineMaintenance.status.in_(["SCHEDULED", "IN_PROGRESS"]),
            MachineMaintenance.end_time > now
        ).all()
    else:
        from datetime import timedelta

    sum_r = summary_title_row + 2
    for m in machines:
        m_slots = [s for s in schedules if s.machine_id == m.id]
        m_load = sum((s.batch.batch_quantity_kg if s.batch else (s.order.quantity_kg if s.order else m.max_batch_kg)) for s in m_slots)
        
        m_loading = float(getattr(m, "loading_time_hours", 0.5) or 0.5)
        m_proc = float(getattr(m, "processing_time_hours", 3.0) or 3.0)
        m_unloading = float(getattr(m, "unloading_time_hours", 0.5) or 0.5)
        m_cleaning = float(getattr(m, "cleaning_time_hours", 1.0) or 1.0)
        m_shift = float(getattr(m, "working_hours_per_day", 8.0) or 8.0)
        
        # Maint in horizon (7 days)
        h_end = now + timedelta(days=7)
        m_maint_hr = 0.0
        for mnt in maints:
            if mnt.machine_id == m.id:
                ov_s = max(now, mnt.start_time)
                ov_e = min(h_end, mnt.end_time)
                if ov_e > ov_s:
                    m_maint_hr += (ov_e - ov_s).total_seconds() / 3600.0

        # Scheduled time
        s_time_hr = 0.0
        for s in m_slots:
            dur_m = (s.loading_min or 0.0) + (s.base_processing_min or 0.0) + (s.unloading_min or 0.0) + (s.cleaning_min or 0.0)
            if dur_m <= 0.001 and s.planned_start and s.planned_end:
                dur_m = (s.planned_end - s.planned_start).total_seconds() / 60.0
            s_time_hr += (dur_m / 60.0)

        avail_hr = max(0.0, (7.0 * m_shift) - m_maint_hr)
        util_pct = min(100.0, round((s_time_hr / avail_hr) * 100.0, 1)) if avail_hr > 0 else 0.0

        row_vals = [
            m.code, m.name, round(m.max_batch_kg, 1), m_loading, m_proc,
            m_unloading, m_cleaning, m_shift, round(m_load, 1), round(s_time_hr, 1),
            round(m_maint_hr, 1), f"{util_pct:.1f}%"
        ]
        ws_matrix.append(row_vals)
        for c_i in range(1, len(row_vals) + 1):
            c = ws_matrix.cell(row=sum_r, column=c_i)
            c.border = thin_border
            c.alignment = Alignment(horizontal="center" if c_i in [1, 3, 4, 5, 6, 7, 8, 10, 11, 12] else "left", vertical="center")
            c.font = Font(name="Arial", size=9, bold=(c_i in [1, 12]), color="0F172A")
            if c_i == 12:
                c.fill = PatternFill(start_color="E0F2FE", end_color="E0F2FE", fill_type="solid")
        sum_r += 1

    # Auto-adjust column widths for matrix sheet
    for col_idx in range(1, max(total_cols + 1, len(sum_headers) + 1)):
        col_letter = get_column_letter(col_idx)
        max_len = 14
        for r in range(4, sum_r):
            val = str(ws_matrix.cell(row=r, column=col_idx).value or "")
            if len(val) > max_len:
                max_len = len(val)
        ws_matrix.column_dimensions[col_letter].width = max(max_len + 3, 14)

    # =========================================================================
    # SHEET 2: DETAILED DISPATCH SLOTS
    # =========================================================================
    ws_slots = wb.create_sheet(title="Detailed Slots")
    header_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
    header_font = Font(name="Arial", size=10, bold=True, color="FFFFFF")

    ws_slots.merge_cells("A1:P1")
    ws_slots["A1"] = f"{settings.PROJECT_NAME} — Production Schedule Dispatch Records"
    ws_slots["A1"].font = Font(name="Arial", size=12, bold=True, color="1E3A8A")
    ws_slots["A1"].alignment = Alignment(horizontal="center", vertical="center")
    ws_slots.row_dimensions[1].height = 26

    slot_headers = [
        "Slot ID", "Order #", "Customer", "Fabric", "Qty (kg)",
        "Colour", "Machine", "Operator", "Planned Start", "Planned End",
        "Loading (min)", "Proc Time (min)", "Unloading (min)", "Cleaning (min)", "Total Time (min)",
        "Freeze Status"
    ]
    ws_slots.append([])
    ws_slots.append(slot_headers)
    ws_slots.row_dimensions[3].height = 20

    for col_num in range(1, len(slot_headers) + 1):
        cell = ws_slots.cell(row=3, column=col_num)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")

    s_row = 4
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

        loading_m = s.loading_min or 0.0
        proc_m = s.base_processing_min or 0.0
        unloading_m = s.unloading_min or 0.0
        clean_m = s.cleaning_min or 0.0
        total_m = loading_m + proc_m + unloading_m + clean_m
        if total_m <= 0.001 and s.planned_start and s.planned_end:
            total_m = (s.planned_end - s.planned_start).total_seconds() / 60.0

        ws_slots.append([
            s.id, ord_num, cust_name, cloth, qty,
            col_name, mach_name, op_name, start_str, end_str,
            round(loading_m, 1), round(proc_m, 1), round(unloading_m, 1), round(clean_m, 1), round(total_m, 1),
            s.freeze_level
        ])

        for col_num in range(1, len(slot_headers) + 1):
            cell = ws_slots.cell(row=s_row, column=col_num)
            cell.border = thin_border
            cell.alignment = Alignment(horizontal="center" if col_num in [1, 5, 9, 10, 11, 12, 13, 14, 15, 16] else "left", vertical="center")
            if s.is_locked:
                cell.fill = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")

        s_row += 1

    for col_idx, col in enumerate(ws_slots.columns, 1):
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = get_column_letter(col_idx)
        ws_slots.column_dimensions[col_letter].width = max(max_len + 3, 12)

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
