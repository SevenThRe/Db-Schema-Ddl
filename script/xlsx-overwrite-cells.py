#!/usr/bin/env python3
"""Patch target cells in an .xlsx workbook with strong style fidelity.

This script updates only target worksheet XML entries and preserves all
other zip members as-is. It does not rewrite styles.xml or workbook-level
metadata.
"""

from __future__ import annotations

import argparse
import json
import os
import posixpath
import re
import sys
import tempfile
import zipfile
from typing import Dict, List, Optional, Tuple
import xml.etree.ElementTree as ET

NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NS_REL_DOC = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS_REL_PKG = "http://schemas.openxmlformats.org/package/2006/relationships"
NS_XML = "http://www.w3.org/XML/1998/namespace"

ET.register_namespace("", NS_MAIN)
ET.register_namespace("r", NS_REL_DOC)

CELL_REF_RE = re.compile(r"^([A-Za-z]+)(\d+)$")


def col_letters_to_index(col_letters: str) -> int:
    value = 0
    for ch in col_letters.upper():
        value = value * 26 + (ord(ch) - 64)
    return value


def parse_cell_ref(address: str) -> Tuple[str, int]:
    match = CELL_REF_RE.match(address)
    if not match:
        raise ValueError(f"Invalid cell address: {address}")
    return match.group(1).upper(), int(match.group(2))


def get_shared_strings(zin: zipfile.ZipFile) -> List[str]:
    if "xl/sharedStrings.xml" not in zin.namelist():
        return []
    root = ET.fromstring(zin.read("xl/sharedStrings.xml"))
    shared: List[str] = []
    for si in root.findall(f".//{{{NS_MAIN}}}si"):
        texts = [node.text or "" for node in si.findall(f".//{{{NS_MAIN}}}t")]
        shared.append("".join(texts))
    return shared


def build_sheet_name_to_path(zin: zipfile.ZipFile) -> Dict[str, str]:
    workbook_root = ET.fromstring(zin.read("xl/workbook.xml"))
    rels_root = ET.fromstring(zin.read("xl/_rels/workbook.xml.rels"))

    rel_map: Dict[str, str] = {}
    for rel in rels_root.findall(f".//{{{NS_REL_PKG}}}Relationship"):
        rel_id = rel.attrib.get("Id")
        rel_target = rel.attrib.get("Target")
        if rel_id and rel_target:
            rel_map[rel_id] = rel_target

    result: Dict[str, str] = {}
    for sheet in workbook_root.findall(f".//{{{NS_MAIN}}}sheet"):
        sheet_name = sheet.attrib.get("name")
        rel_id = sheet.attrib.get(f"{{{NS_REL_DOC}}}id")
        if not sheet_name or not rel_id:
            continue
        target = rel_map.get(rel_id)
        if not target:
            continue

        if target.startswith("/"):
            normalized = target.lstrip("/")
        else:
            normalized = posixpath.normpath(posixpath.join("xl", target))
        result[sheet_name] = normalized

    return result


def extract_cell_text(cell: ET.Element, shared_strings: List[str]) -> str:
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        texts = [node.text or "" for node in cell.findall(f".//{{{NS_MAIN}}}t")]
        return "".join(texts)

    value_node = cell.find(f"{{{NS_MAIN}}}v")
    if value_node is None or value_node.text is None:
        return ""
    raw_value = value_node.text

    if cell_type == "s":
        try:
            idx = int(raw_value)
            if 0 <= idx < len(shared_strings):
                return shared_strings[idx]
        except ValueError:
            pass
    return raw_value


def find_row(sheet_data: ET.Element, row_num: int) -> Optional[ET.Element]:
    for row in sheet_data.findall(f"{{{NS_MAIN}}}row"):
        if row.attrib.get("r") == str(row_num):
            return row
    return None


def insert_row_sorted(sheet_data: ET.Element, row_num: int) -> ET.Element:
    new_row = ET.Element(f"{{{NS_MAIN}}}row", {"r": str(row_num)})
    rows = sheet_data.findall(f"{{{NS_MAIN}}}row")
    insert_at = len(rows)
    for idx, row in enumerate(rows):
        try:
            existing_num = int(row.attrib.get("r", "0"))
        except ValueError:
            existing_num = 0
        if existing_num > row_num:
            insert_at = idx
            break
    sheet_data.insert(insert_at, new_row)
    return new_row


def find_cell(row: ET.Element, address: str) -> Optional[ET.Element]:
    for cell in row.findall(f"{{{NS_MAIN}}}c"):
        if cell.attrib.get("r") == address:
            return cell
    return None


def insert_cell_sorted(row: ET.Element, address: str) -> ET.Element:
    col_letters, _ = parse_cell_ref(address)
    col_idx = col_letters_to_index(col_letters)

    new_cell = ET.Element(f"{{{NS_MAIN}}}c", {"r": address})
    cells = row.findall(f"{{{NS_MAIN}}}c")
    insert_at = len(cells)
    for idx, cell in enumerate(cells):
        existing_ref = cell.attrib.get("r", "")
        match = CELL_REF_RE.match(existing_ref)
        if not match:
            continue
        existing_idx = col_letters_to_index(match.group(1))
        if existing_idx > col_idx:
            insert_at = idx
            break
    row.insert(insert_at, new_cell)
    return new_cell


def write_inline_string(cell: ET.Element, value: str) -> None:
    for child in list(cell):
        cell.remove(child)
    cell.attrib["t"] = "inlineStr"
    inline = ET.SubElement(cell, f"{{{NS_MAIN}}}is")
    text = ET.SubElement(inline, f"{{{NS_MAIN}}}t")
    if value.startswith(" ") or value.endswith(" "):
        text.attrib[f"{{{NS_XML}}}space"] = "preserve"
    text.text = value


def patch_sheet_xml(
    sheet_bytes: bytes,
    shared_strings: List[str],
    changes: List[dict],
) -> Tuple[bytes, int, List[dict]]:
    root = ET.fromstring(sheet_bytes)
    sheet_data = root.find(f"{{{NS_MAIN}}}sheetData")
    if sheet_data is None:
        raise ValueError("sheetData not found")

    applied = 0
    issues: List[dict] = []

    for change in changes:
        address = str(change.get("sourceAddress", "")).strip()
        before = str(change.get("beforeName", ""))
        after = str(change.get("afterName", ""))
        table_index = int(change.get("tableIndex", -1))
        column_index_raw = change.get("columnIndex")
        column_index = None if column_index_raw is None else int(column_index_raw)
        target = "table" if change.get("target") == "table" else "column"

        try:
            _, row_num = parse_cell_ref(address)
        except ValueError as error:
            issues.append(
                {
                    "sheetName": change.get("sheetName", ""),
                    "sourceAddress": address,
                    "reason": str(error),
                    "tableIndex": table_index,
                    "columnIndex": column_index,
                    "target": target,
                }
            )
            continue

        row = find_row(sheet_data, row_num)
        existing_cell = find_cell(row, address) if row is not None else None
        current_value = extract_cell_text(existing_cell, shared_strings) if existing_cell is not None else ""

        if current_value.strip() not in (before.strip(), after.strip()):
            issues.append(
                {
                    "sheetName": change.get("sheetName", ""),
                    "sourceAddress": address,
                    "reason": f'Cell value mismatch. expected="{before}" actual="{current_value}"',
                    "tableIndex": table_index,
                    "columnIndex": column_index,
                    "target": target,
                }
            )
            continue

        if row is None:
            row = insert_row_sorted(sheet_data, row_num)
        cell = existing_cell if existing_cell is not None else insert_cell_sorted(row, address)
        write_inline_string(cell, after)
        applied += 1

    xml_bytes = ET.tostring(root, encoding="utf-8", xml_declaration=True)
    return xml_bytes, applied, issues


def copy_zip_with_replacements(
    workbook_path: str,
    replacements: Dict[str, bytes],
) -> None:
    with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as tmp_file:
        temp_path = tmp_file.name

    try:
        with zipfile.ZipFile(workbook_path, "r") as zin, zipfile.ZipFile(temp_path, "w") as zout:
            for info in zin.infolist():
                data = replacements.get(info.filename, zin.read(info.filename))
                new_info = zipfile.ZipInfo(info.filename, info.date_time)
                new_info.compress_type = info.compress_type
                new_info.comment = info.comment
                new_info.create_system = info.create_system
                new_info.create_version = info.create_version
                new_info.extract_version = info.extract_version
                new_info.flag_bits = info.flag_bits
                new_info.external_attr = info.external_attr
                new_info.internal_attr = info.internal_attr
                new_info.extra = info.extra
                zout.writestr(new_info, data)
        os.replace(temp_path, workbook_path)
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


def main() -> int:
    parser = argparse.ArgumentParser(description="Overwrite xlsx cells with style-preserving strategy.")
    parser.add_argument("--workbook", required=True, help="Workbook path (.xlsx)")
    parser.add_argument("--changes", required=True, help="JSON payload path")
    args = parser.parse_args()

    workbook_path = os.path.abspath(args.workbook)
    if not workbook_path.lower().endswith(".xlsx"):
        raise RuntimeError("Only .xlsx is supported by style-preserving overwrite.")

    with open(args.changes, "r", encoding="utf-8") as fp:
        payload = json.load(fp)

    changes = payload.get("changes", [])
    if not isinstance(changes, list):
        raise RuntimeError("Invalid payload: changes must be an array.")

    with zipfile.ZipFile(workbook_path, "r") as zin:
        shared_strings = get_shared_strings(zin)
        sheet_map = build_sheet_name_to_path(zin)

        grouped: Dict[str, List[dict]] = {}
        issues: List[dict] = []
        for change in changes:
            sheet_name = str(change.get("sheetName", ""))
            target_path = sheet_map.get(sheet_name)
            if not target_path:
                issues.append(
                    {
                        "sheetName": sheet_name,
                        "sourceAddress": str(change.get("sourceAddress", "")),
                        "reason": "Worksheet not found in workbook",
                        "tableIndex": int(change.get("tableIndex", -1)),
                        "columnIndex": change.get("columnIndex"),
                        "target": "table" if change.get("target") == "table" else "column",
                    }
                )
                continue
            grouped.setdefault(target_path, []).append(change)

        replacements: Dict[str, bytes] = {}
        applied_count = 0
        for sheet_path, sheet_changes in grouped.items():
            if sheet_path not in zin.namelist():
                for change in sheet_changes:
                    issues.append(
                        {
                            "sheetName": str(change.get("sheetName", "")),
                            "sourceAddress": str(change.get("sourceAddress", "")),
                            "reason": "Worksheet xml entry not found in workbook zip",
                            "tableIndex": int(change.get("tableIndex", -1)),
                            "columnIndex": change.get("columnIndex"),
                            "target": "table" if change.get("target") == "table" else "column",
                        }
                    )
                continue

            patched_xml, applied, sheet_issues = patch_sheet_xml(
                zin.read(sheet_path),
                shared_strings,
                sheet_changes,
            )
            replacements[sheet_path] = patched_xml
            applied_count += applied
            issues.extend(sheet_issues)

    if replacements:
        copy_zip_with_replacements(workbook_path, replacements)

    print(
        json.dumps(
            {
                "appliedCount": applied_count,
                "issues": issues,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # pragma: no cover - defensive surface for CLI use
        print(str(exc), file=sys.stderr)
        sys.exit(1)
