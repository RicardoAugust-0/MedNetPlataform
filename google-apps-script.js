/**
 * MedNet — Registro automático na planilha de intervenções
 *
 * COMO DEPLOYAR:
 * 1. Abra a planilha no Google Sheets
 * 2. Extensões → Apps Script
 * 3. Apague o código existente e cole este arquivo inteiro
 * 4. Salvar (Ctrl+S) → Implantar → Nova implantação
 *    - Tipo: "Aplicativo da Web"
 *    - Executar como: "Eu (seu e-mail)"
 *    - Quem tem acesso: "Qualquer pessoa"
 * 5. Autorizar o acesso quando solicitado
 * 6. Copie a URL gerada e adicione ao .env:
 *    VITE_SHEETS_WEBHOOK_URL=https://script.google.com/macros/s/SEU_ID/exec
 *
 * ATENÇÃO: ao atualizar o script, sempre crie uma NOVA implantação
 * (não edite a existente), senão a URL não reflete as mudanças.
 *
 * COLUNAS DA PLANILHA (ordem exata):
 * A: DATA | B: EMPRESA | C: SISTEMA | D: COLABORADOR | E: PLACA
 * F: FROTA | G: CRITICIDADE | H: CLASSIFICAÇÃO | I: REALIZADO?
 * J: MOTIVO | K: SOLICITADO POR | L: HORA SOLICITAÇÃO
 * M: REALIZADO POR | N: HORA REALIZAÇÃO | O: JUSTIFICATIVA PARA NÃO REALIZAÇÃO
 */

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Usa a aba do mês atual (ex: "MAIO 2026") ou a primeira aba
    const mesAtual = getMesAtual();
    const sheet = ss.getSheetByName(mesAtual) || ss.getSheets()[0];

    // Linha a inserir — colunas A até O (15 colunas)
    const row = [
      payload.data            || '',   // A: DATA
      payload.empresa         || '',   // B: EMPRESA
      payload.sistema         || '',   // C: SISTEMA
      payload.colaborador     || '',   // D: COLABORADOR
      payload.placa           || '',   // E: PLACA
      payload.frota           || '',   // F: FROTA
      payload.criticidade     || '',   // G: CRITICIDADE
      payload.classificacao   || '',   // H: CLASSIFICAÇÃO
      '',                              // I: REALIZADO? (operador preenche)
      payload.motivo          || '',   // J: MOTIVO
      payload.solicitadoPor   || '',   // K: SOLICITADO POR
      payload.horaSolicitacao || '',   // L: HORA SOLICITAÇÃO
      '',                              // M: REALIZADO POR (operador preenche)
      '',                              // N: HORA REALIZAÇÃO (operador preenche)
      '',                              // O: JUSTIFICATIVA (operador preenche)
    ];

    sheet.appendRow(row);

    // Colorir a linha conforme CRITICIDADE
    const lastRow = sheet.getLastRow();
    const range   = sheet.getRange(lastRow, 1, 1, 15);
    const crit    = (payload.criticidade || '').toUpperCase();
    if (crit === 'GRAVÍSSIMO' || crit === 'GRAVISSIMO') {
      sheet.getRange(lastRow, 7).setBackground('#FF9999').setFontWeight('bold');
    } else if (crit === 'GRAVE') {
      sheet.getRange(lastRow, 7).setBackground('#FFD966');
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, linha: lastRow, aba: sheet.getName() }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getMesAtual() {
  const meses = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
                 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
  const now = new Date();
  return meses[now.getMonth()] + ' ' + now.getFullYear();
}

function doGet() {
  return ContentService
    .createTextOutput('MedNet Sheets Webhook ativo — ' + getMesAtual())
    .setMimeType(ContentService.MimeType.TEXT);
}
