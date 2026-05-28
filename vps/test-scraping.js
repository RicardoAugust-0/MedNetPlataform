import "dotenv/config";
import fs from "fs";
import path from "path";
import { downloadReport } from "./bot/maxtrack.js";
import { parseCsv } from "./bot/parser-bridge.js";

async function runTest() {
  console.log(
    "[Teste] Iniciando teste do fluxo completo de scraping da Maxtrack...",
  );

  try {
    // 1. Executa o download real usando o Playwright que acabamos de implementar
    const csvContent = await downloadReport();

    console.log(
      "[Teste] Download bem-sucedido! Tamanho do CSV:",
      csvContent.length,
      "caracteres.",
    );

    // Salvar o arquivo localmente apenas para inspecionar se necessário
    const debugPath = path.join(process.cwd(), "debug_output.csv");
    fs.writeFileSync(debugPath, csvContent, "utf8");
    console.log("[Teste] Cópia do CSV salva para depuração em:", debugPath);

    // 2. Executa o parsing do CSV baixado
    console.log("[Teste] Iniciando parsing do CSV...");
    const { rawEventRows } = await parseCsv(csvContent);

    console.log("[Teste] --- RESULTADO DO PARSE ---");
    console.log(`Eventos encontrados: ${rawEventRows.length}`);

    if (rawEventRows.length > 0) {
      console.log("Primeiros 3 eventos processados:");
      console.log(JSON.stringify(rawEventRows.slice(0, 3), null, 2));
    } else {
      console.log(
        "Nenhum evento encontrado no CSV (ou todos foram ignorados pelas regras de velocidade mínima).",
      );
    }
  } catch (error) {
    console.error("[Teste] Falha fatal no fluxo:", error);
  }
}

runTest();
