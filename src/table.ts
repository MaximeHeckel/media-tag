import pc from "picocolors";

export type AssetInspectionRow = {
  asset: string;
  kind: string;
  tags: string;
};

export function renderInspectionTable(
  rows: AssetInspectionRow[],
  terminalWidth = 120,
): string {
  const width = Math.max(60, Math.min(180, terminalWidth));
  const assetWidth = Math.min(42, Math.floor(width * 0.3));
  const widths = [assetWidth, 5, width - assetWidth - 5 - 10];
  const border = (left: string, middle: string, right: string) =>
    pc.dim(left + widths.map((size) => "─".repeat(size + 2)).join(middle) + right);
  const line = (cells: string[]) => pc.dim("│") + cells.map((cell, index) =>
    ` ${cell}${" ".repeat(Math.max(0, widths[index] - Array.from(cell).length))} `,
  ).join(pc.dim("│")) + pc.dim("│");
  const output = [
    border("╭", "┬", "╮"),
    pc.bold(line(["Asset", "Type", "Metadata tags"])),
    border("├", "┼", "┤"),
  ];

  rows.forEach((row, index) => {
    const cells = [row.asset, row.kind, row.tags].map((value, column) =>
      wrapCell(value, widths[column]),
    );
    const height = Math.max(...cells.map((cell) => cell.length));
    for (let offset = 0; offset < height; offset += 1) {
      output.push(line(cells.map((cell) => cell[offset] ?? "")));
    }
    if (index < rows.length - 1) {
      output.push(border("├", "┼", "┤"));
    }
  });
  output.push(border("╰", "┴", "╯"));
  return output.join("\n");
}

function wrapCell(value: string, width: number): string[] {
  // Keep file names and metadata from injecting terminal control sequences.
  const remaining = Array.from(value.replace(/[\u0000-\u001f\u007f-\u009f]/g, " "));
  const lines: string[] = [];
  while (remaining.length > width) {
    const space = remaining.slice(0, width + 1).lastIndexOf(" ");
    const length = space > 0 ? space : width;
    lines.push(remaining.splice(0, length).join(""));
    if (remaining[0] === " ") {
      remaining.shift();
    }
  }
  lines.push(remaining.join(""));
  return lines;
}
