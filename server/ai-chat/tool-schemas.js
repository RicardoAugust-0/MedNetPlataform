// Declarações das ferramentas expostas à IA, nos formatos de cada provedor.

// Anthropic Tool Declarations
export const ANTHROPIC_TOOLS = [
  {
    name: 'query_database_records',
    description: 'Query database records. Used to fetch data from profiles, driver_events, atendimentos, platform_rules, custom_rules, etc.',
    input_schema: {
      type: 'object',
      properties: {
        table_name: { type: 'string', description: 'Table name: driver_events, atendimentos, platform_rules, custom_rules, profiles' },
        select_fields: { type: 'string', description: 'Comma separated fields to select, e.g., "*"' },
        filters: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string' },
              operator: { type: 'string', description: 'eq, neq, gt, gte, lt, lte, like, ilike, in' },
              value: { type: 'string' }
            },
            required: ['field', 'operator', 'value']
          }
        },
        order_by: { type: 'string', description: 'Order by column name, e.g. "created_at.desc"' },
        limit: { type: 'integer', description: 'Max records to return (default 500). Use 1000+ when aggregating all driver events in a day.' }
      },
      required: ['table_name']
    }
  },
  {
    name: 'create_database_record',
    description: 'Insert a new record into a table.',
    input_schema: {
      type: 'object',
      properties: {
        table_name: { type: 'string' },
        data: { type: 'object', description: 'JSON fields' }
      },
      required: ['table_name', 'data']
    }
  },
  {
    name: 'update_database_record',
    description: 'Update existing records in a table.',
    input_schema: {
      type: 'object',
      properties: {
        table_name: { type: 'string' },
        filters: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string' },
              operator: { type: 'string' },
              value: { type: 'string' }
            },
            required: ['field', 'operator', 'value']
          }
        },
        data: { type: 'object', description: 'JSON fields to update' }
      },
      required: ['table_name', 'filters', 'data']
    }
  },
  {
    name: 'delete_database_record',
    description: 'Delete records in a table.',
    input_schema: {
      type: 'object',
      properties: {
        table_name: { type: 'string' },
        filters: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string' },
              operator: { type: 'string' },
              value: { type: 'string' }
            },
            required: ['field', 'operator', 'value']
          }
        }
      },
      required: ['table_name', 'filters']
    }
  },
  {
    name: 'save_generated_report',
    description: 'Saves a structured report or document (markdown text and optional chart) to the administrative reports gallery so the user can access and download it later.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Título claro do relatório, ex: "Relatório de Reincidência de Fadiga - Junho 2026"' },
        content: { type: 'string', description: 'Conteúdo do relatório formatado em Markdown.' },
        chart_payload: {
          type: 'object',
          description: 'Estrutura JSON do gráfico Recharts associado (opcional), contendo chartType, title, subtitle, xAxisKey, yAxisKey e data.'
        }
      },
      required: ['title', 'content']
    }
  },
  {
    name: 'configure_ai_provider',
    description: 'Configura o provedor e/ou modelo de IA ativos da plataforma. Use quando o usuário pedir para trocar o provedor (anthropic/google) ou o modelo usado. Envie apenas os campos que devem mudar.',
    input_schema: {
      type: 'object',
      properties: {
        provider: { type: 'string', description: "Provedor ativo: 'anthropic' ou 'google'." },
        anthropic_model: { type: 'string', description: "Modelo Anthropic, ex: 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-opus-4-7'." },
        google_model: { type: 'string', description: "Modelo Google, ex: 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'." }
      }
    }
  },
  {
    name: 'set_ai_api_key',
    description: 'Salva ou substitui a chave de API (API key) de um provedor de IA. Use quando o usuário fornecer uma chave de API para configurar. Faz upsert, então funciona tanto para criar quanto para substituir.',
    input_schema: {
      type: 'object',
      properties: {
        provider: { type: 'string', description: "Provedor: 'anthropic' ou 'google'." },
        api_key: { type: 'string', description: 'A chave de API a ser salva.' }
      },
      required: ['provider', 'api_key']
    }
  },
  {
    name: 'clear_chat_history',
    description: 'Limpa o histórico de mensagens do chat do usuário atual. Sem thread_id, apaga TODAS as conversas do usuário; com thread_id, apaga apenas as mensagens daquela conversa.',
    input_schema: {
      type: 'object',
      properties: {
        thread_id: { type: 'string', description: 'ID da conversa específica a limpar (opcional). Omita para limpar todo o histórico.' }
      }
    }
  },
  {
    name: 'generate_pdf_report',
    description: 'Gera um documento PDF para download a partir de conteúdo Markdown e retorna um link de download. Use para dossiês/laudos de motoristas e relatórios. IMPORTANTE: primeiro consulte os dados necessários (driver_events, atendimentos, driver_health) e ESCREVA o conteúdo completo do laudo em Markdown; depois passe esse texto no campo content.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Título do documento, ex: "Dossiê do Motorista — João da Silva".' },
        content: { type: 'string', description: 'Conteúdo completo do documento em Markdown (títulos #, listas, negrito).' },
        subtitle: { type: 'string', description: 'Subtítulo opcional, ex: "Placa ABC-1234 · Período: últimos 6 meses".' }
      },
      required: ['title', 'content']
    }
  },
  {
    name: 'aggregate_driver_events',
    description: 'Retorna ranking de motoristas pré-agregado pelo banco (GROUP BY no PostgreSQL). Use SEMPRE que o usuário pedir "top N motoristas", "quais têm mais alertas", "ranking de reincidentes", "quantos eventos por motorista". Muito mais eficiente e confiável que query_database_records para agrupamentos — evita truncagem de dados.',
    input_schema: {
      type: 'object',
      properties: {
        platform_id: { type: 'string', description: "Filtra por plataforma: 'sascar', 'maxtrack', 'omnilink', 'sighra', 'horizon'. Omita para todas as plataformas." },
        since_hours: { type: 'integer', description: 'Janela de tempo em horas (padrão 24). Use 48 para 2 dias, 168 para 7 dias.' },
        limit: { type: 'integer', description: 'Quantidade de motoristas no ranking (padrão 10).' },
        category: { type: 'string', description: "Filtra por categoria de evento: 'intervencao', 'reportar', 'tecnico'. Omita para todas." }
      }
    }
  }
];

// Gemini Tool Declarations
export const GEMINI_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'query_database_records',
        description: 'Query database records. Used to fetch data from profiles, driver_events, atendimentos, platform_rules, custom_rules, etc.',
        parameters: {
          type: 'OBJECT',
          properties: {
            table_name: { type: 'STRING', description: 'Table name: driver_events, atendimentos, platform_rules, custom_rules, profiles' },
            select_fields: { type: 'STRING', description: 'Comma separated fields to select, e.g., "*"' },
            filters: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  field: { type: 'STRING' },
                  operator: { type: 'STRING', description: 'eq, neq, gt, gte, lt, lte, like, ilike, in' },
                  value: { type: 'STRING' }
                },
                required: ['field', 'operator', 'value']
              }
            },
            order_by: { type: 'STRING', description: 'Order by column name, e.g. "created_at desc"' },
            limit: { type: 'INTEGER', description: 'Max records to return (default 500). Use 1000+ when aggregating all driver events in a day.' }
          },
          required: ['table_name']
        }
      },
      {
        name: 'create_database_record',
        description: 'Insert a new record into a table.',
        parameters: {
          type: 'OBJECT',
          properties: {
            table_name: { type: 'STRING' },
            data: { type: 'OBJECT', description: 'JSON fields' }
          },
          required: ['table_name', 'data']
        }
      },
      {
        name: 'update_database_record',
        description: 'Update existing records in a table.',
        parameters: {
          type: 'OBJECT',
          properties: {
            table_name: { type: 'STRING' },
            filters: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  field: { type: 'STRING' },
                  operator: { type: 'STRING' },
                  value: { type: 'STRING' }
                },
                required: ['field', 'operator', 'value']
              }
            },
            data: { type: 'OBJECT', description: 'JSON fields to update' }
          },
          required: ['table_name', 'filters', 'data']
        }
      },
      {
        name: 'delete_database_record',
        description: 'Delete records in a table.',
        parameters: {
          type: 'OBJECT',
          properties: {
            table_name: { type: 'STRING' },
            filters: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  field: { type: 'STRING' },
                  operator: { type: 'STRING' },
                  value: { type: 'STRING' }
                },
                required: ['field', 'operator', 'value']
              }
            }
          },
          required: ['table_name', 'filters']
        }
      },
      {
        name: 'save_generated_report',
        description: 'Saves a structured report or document (markdown text and optional chart) to the administrative reports gallery so the user can access and download it later.',
        parameters: {
          type: 'OBJECT',
          properties: {
            title: { type: 'STRING', description: 'Título claro do relatório, ex: "Relatório de Reincidência de Fadiga - Junho 2026"' },
            content: { type: 'STRING', description: 'Conteúdo do relatório formatado em Markdown.' },
            chart_payload: {
              type: 'OBJECT',
              description: 'Estrutura JSON do gráfico Recharts associado (opcional), contendo chartType, title, subtitle, xAxisKey, yAxisKey e data.'
            }
          },
          required: ['title', 'content']
        }
      },
      {
        name: 'configure_ai_provider',
        description: 'Configura o provedor e/ou modelo de IA ativos da plataforma. Use quando o usuário pedir para trocar o provedor (anthropic/google) ou o modelo usado. Envie apenas os campos que devem mudar.',
        parameters: {
          type: 'OBJECT',
          properties: {
            provider: { type: 'STRING', description: "Provedor ativo: 'anthropic' ou 'google'." },
            anthropic_model: { type: 'STRING', description: "Modelo Anthropic, ex: 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-opus-4-7'." },
            google_model: { type: 'STRING', description: "Modelo Google, ex: 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'." }
          }
        }
      },
      {
        name: 'set_ai_api_key',
        description: 'Salva ou substitui a chave de API (API key) de um provedor de IA. Use quando o usuário fornecer uma chave de API para configurar. Faz upsert, então funciona tanto para criar quanto para substituir.',
        parameters: {
          type: 'OBJECT',
          properties: {
            provider: { type: 'STRING', description: "Provedor: 'anthropic' ou 'google'." },
            api_key: { type: 'STRING', description: 'A chave de API a ser salva.' }
          },
          required: ['provider', 'api_key']
        }
      },
      {
        name: 'clear_chat_history',
        description: 'Limpa o histórico de mensagens do chat do usuário atual. Sem thread_id, apaga TODAS as conversas do usuário; com thread_id, apaga apenas as mensagens daquela conversa.',
        parameters: {
          type: 'OBJECT',
          properties: {
            thread_id: { type: 'STRING', description: 'ID da conversa específica a limpar (opcional). Omita para limpar todo o histórico.' }
          }
        }
      },
      {
        name: 'generate_pdf_report',
        description: 'Gera um documento PDF para download a partir de conteúdo Markdown e retorna um link de download. Use para dossiês/laudos de motoristas e relatórios. IMPORTANTE: primeiro consulte os dados necessários (driver_events, atendimentos, driver_health) e ESCREVA o conteúdo completo do laudo em Markdown; depois passe esse texto no campo content.',
        parameters: {
          type: 'OBJECT',
          properties: {
            title: { type: 'STRING', description: 'Título do documento, ex: "Dossiê do Motorista — João da Silva".' },
            content: { type: 'STRING', description: 'Conteúdo completo do documento em Markdown (títulos #, listas, negrito).' },
            subtitle: { type: 'STRING', description: 'Subtítulo opcional, ex: "Placa ABC-1234 · Período: últimos 6 meses".' }
          },
          required: ['title', 'content']
        }
      },
      {
        name: 'aggregate_driver_events',
        description: 'Retorna ranking de motoristas pré-agregado pelo banco (GROUP BY no PostgreSQL). Use SEMPRE que o usuário pedir "top N motoristas", "quais têm mais alertas", "ranking de reincidentes", "quantos eventos por motorista". Muito mais eficiente e confiável que query_database_records para agrupamentos — evita truncagem de dados.',
        parameters: {
          type: 'OBJECT',
          properties: {
            platform_id: { type: 'STRING', description: "Filtra por plataforma: 'sascar', 'maxtrack', 'omnilink', 'sighra', 'horizon'. Omita para todas as plataformas." },
            since_hours: { type: 'INTEGER', description: 'Janela de tempo em horas (padrão 24). Use 48 para 2 dias, 168 para 7 dias.' },
            limit: { type: 'INTEGER', description: 'Quantidade de motoristas no ranking (padrão 10).' },
            category: { type: 'STRING', description: "Filtra por categoria de evento: 'intervencao', 'reportar', 'tecnico'. Omita para todas." }
          }
        }
      }
    ]
  }
];
