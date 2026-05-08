/**
 * MedNet — Registro automático de intervenções na planilha
 *
 * COMO DEPLOYAR:
 * 1. Abra a planilha no Google Sheets
 * 2. Extensões → Apps Script
 * 3. Apague o código existente e cole este arquivo inteiro
 * 4. Salvar → Implantar → Nova implantação
 * 5. Tipo: "Aplicativo da Web"
 *    Executar como: "Eu (meu e-mail)"
 *    Quem tem acesso: "Qualquer pessoa"
 * 6. Copie a URL gerada e coloque em VITE_SHEETS_WEBHOOK_URL no .env
 *
 * COLUNAS ESPERADAS (ajuste os nomes conforme sua planilha real):
 * A: Data | B: Hora | C: Motorista | D: Placa | E: Transportadora
 * F: Eventos | G: Quantidade | H: Severidade | I: Operador | J: Observação
 */

const SHEET_NAME = 'Intervenções'; // Nome da aba — mude se necessário
const HEADER_ROW = ['Data', 'Hora', 'Motorista', 'Placa', 'Transportadora', 'Eventos', 'Quantidade', 'Severidade', 'Operador', 'Observação'];

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    let sheet   = ss.getSheetByName(SHEET_NAME);

    // Cria a aba se não existir
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(HEADER_ROW);
      sheet.getRange(1, 1, 1, HEADER_ROW.length)
        .setFontWeight('bold')
        .setBackground('#1A1530')
        .setFontColor('#FFFFFF');
      sheet.setFrozenRows(1);
    }

    sheet.appendRow([
      payload.data          || '',
      payload.hora          || '',
      payload.motorista     || '',
      payload.placa         || '',
      payload.transportadora|| '',
      payload.eventos       || '',
      payload.quantidade    || '',
      payload.severidade    || '',
      payload.operador      || '',
      payload.obs           || '',
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Permite requisições OPTIONS (CORS preflight)
function doGet() {
  return ContentService
    .createTextOutput('MedNet Sheets Webhook ativo')
    .setMimeType(ContentService.MimeType.TEXT);
}
