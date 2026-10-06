const { Project, SyntaxKind } = require('ts-morph');

const project = new Project({
  tsConfigFilePath: "tsconfig.app.json",
});

const sourceFiles = project.getSourceFiles("src/**/*.tsx");
let changed = 0;

for (const sf of sourceFiles) {
  // Only process files that use downloadReportPdf
  const text = sf.getFullText();
  if (!text.includes("downloadReportPdf")) continue;
  if (!text.includes("Download PDF")) continue; // Only UI files

  // 1. Ensure downloadReportExcel is imported from "@/lib/report-pdf"
  const importDecls = sf.getImportDeclarations();
  let foundExcel = false;
  let reportPdfImport = null;
  for (const imp of importDecls) {
    if (imp.getModuleSpecifierValue() === "@/lib/report-pdf") {
      reportPdfImport = imp;
      for (const named of imp.getNamedImports()) {
        if (named.getName() === "downloadReportExcel") foundExcel = true;
      }
    }
  }
  if (reportPdfImport && !foundExcel) {
    reportPdfImport.addNamedImport("downloadReportExcel");
  }

  // We are going to replace `<Button... onClick={exportPdf}>...Download PDF...</Button>`
  // But wait, it's easier to create a wrapper Component `<ReportExportButtons data={() => ({...})} />`
  // Actually, rewriting React nodes with AST is verbose. 
  // Maybe I can just monkey patch `downloadReportPdf` to show a prompt dialog using `window.confirm`!
  // Wait, no. A modal inside `downloadReportPdf` that asks "Download as PDF or Excel?"
  // YES! I can do that without changing ANY UI FILES!
  
  // Let's stop the script and think.
}
