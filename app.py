from flask import Flask, render_template, request, jsonify
import requests
import os
import json
import re

app = Flask(__name__)


headers = {
    "accept": "application/json",
    "Authorization": "Bearer b332b4d3-b46b-3c8c-ac2e-3dc97133cc68"
}

empenho_url = "https://gateway.apilib.prefeitura.sp.gov.br/sf/sof/v4/empenhos"
contrato_url = "https://gateway.apilib.prefeitura.sp.gov.br/sf/sof/v4/contratos"

@app.route("/")
def index():
    return render_template("index.html")

def buscar_empenhos_por_razao_social(anoEmpenho, mesEmpenho, razao_social, codorgao):
    """
    Função que busca empenhos para uma razão social específica
    """
    params = {
        "anoEmpenho": anoEmpenho,
        "mesEmpenho": mesEmpenho,
        "txtRazaoSocial": razao_social,
        "codorgao": codorgao  # Adicionado o parâmetro codorgao
    }
    
    try:
        response = requests.get(empenho_url, headers=headers, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()
        empenhos = data.get("lstEmpenhos", [])
        
        # Calcula o valor total empenhado para esta razão social
        total_empenhado = sum(emp.get("valEmpenhadoLiquido", 0) for emp in empenhos)
        
        return {
            "razao_social": razao_social,
            "total_empenhado": total_empenhado,
            "quantidade_empenhos": len(empenhos),
            "empenhos": empenhos
        }
        
    except Exception as e:
        print(f"Erro na busca de empenhos para '{razao_social}': {str(e)}")
        return {
            "razao_social": razao_social,
            "erro": str(e),
            "total_empenhado": 0,
            "quantidade_empenhos": 0,
            "empenhos": []
        }

def obter_razoes_sociais(anoEmpenho, mesEmpenho, codorgao):
    """
    Função para obter a lista de razões sociais disponíveis
    """
    
    params = {
        "anoEmpenho": anoEmpenho,
        "mesEmpenho": mesEmpenho,
        "codorgao": codorgao
    }
    
    try:
        response = requests.get(empenho_url, headers=headers, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()
        empenhos = data.get("lstEmpenhos", [])
        
        # Extrair razões sociais únicas dos empenhos
        razoes_sociais_unicas = set()
        for emp in empenhos:
            razao_social = emp.get("txtRazaoSocial", "").strip()
            if razao_social:  # Ignorar razões sociais vazias
                razoes_sociais_unicas.add(razao_social)

        # Converter o conjunto para uma lista
        lista_razoes_sociais = list(razoes_sociais_unicas)
        print(f"Encontradas {len(lista_razoes_sociais)} razões sociais únicas")
        
        return lista_razoes_sociais
        
    except Exception as e:
        print(f"Erro ao obter razões sociais: {str(e)}")
        return []

def buscar_empenhos_todas_razoes_sociais(anoEmpenho, mesEmpenho, razao_social, codorgao):
    """
    Função que busca empenhos para todas as razões sociais e salva cada resultado em um arquivo JSON separado.
    """
    # Primeiro, obtemos a lista de razões sociais
    razoes_sociais = obter_razoes_sociais(anoEmpenho, mesEmpenho, codorgao)
    
    if not razoes_sociais:
        return {"error": "Nenhuma razão social encontrada para os parâmetros informados."}
    
    resultados = []
    
    # Cria uma pasta para salvar os arquivos (opcional mas recomendado)
    pasta_resultados = "resultados_empenhos"
    os.makedirs(pasta_resultados, exist_ok=True)
    
    for razao_social in razoes_sociais:
        resultado = buscar_empenhos_por_razao_social(
            anoEmpenho=anoEmpenho, 
            mesEmpenho=mesEmpenho, 
            razao_social=razao_social, 
            codorgao=codorgao)
        resultados.append(resultado)
        # Limpa o nome do arquivo para evitar caracteres proibidos
        nome_arquivo = re.sub(r'[^a-zA-Z0-9_-]', '_', razao_social)
        caminho_arquivo = os.path.join(pasta_resultados, f"{nome_arquivo}.json")

        with open(caminho_arquivo, "w", encoding="utf-8") as f:
            json.dump({
                "razao_social": razao_social,
                "resultado": resultado
            }, f, ensure_ascii=False, indent=4)

    resultados.sort(key=lambda x: x["total_empenhado"], reverse=True)
    return {"resultados": resultados,
            "message": f"Arquivos JSON criados na pasta '{pasta_resultados}' com sucesso."}
       
def calcular_valor_contrato(contrato):
    """
    Calcula o valor total do contrato considerando aditamentos e reajustes
    """
    
    val_contrato = contrato.get("valAditamentos", 0) + contrato.get("valReajustes", 0)
    if val_contrato == 0:
        val_contrato = contrato.get("valPrincipal", 0)
    return val_contrato

def salvar_contrato_json(razao_social, anoContrato, numContrato, contrato_data):
    """
    Função para salvar os dados do contrato em um arquivo JSON
    dentro da pasta 'resultados_contratos'.
    """
    # Criar pasta para os resultados dos contratos se não existir
    pasta_resultados = "resultados_contratos"
    os.makedirs(pasta_resultados, exist_ok=True)
    
    # Limpar o nome do arquivo para evitar caracteres proibidos
    nome_base = re.sub(r'[^a-zA-Z0-9_-]', '_', razao_social)
    # Incluir ano e número do contrato no nome do arquivo para diferenciar múltiplos contratos
    nome_arquivo = f"{nome_base}_contrato_{anoContrato}_{numContrato}.json"
    caminho_arquivo = os.path.join(pasta_resultados, nome_arquivo)
    
    # Salvar os dados do contrato em um arquivo JSON
    with open(caminho_arquivo, "w", encoding="utf-8") as f:
        json.dump(contrato_data, f, ensure_ascii=False, indent=4)
    
    return caminho_arquivo
        
def buscar_todos_contratos_por_razao_social(razao_social, empenhos):
    """
    Função para buscar todos os contratos únicos relacionados a uma razão social.
    """
    # Conjunto para armazenar pares únicos de (anoContrato, numContrato)
    contratos_unicos = set()
    
    # Identificar todos os contratos únicos nos empenhos
    for empenho in empenhos:
        anoContrato = empenho.get("anoContrato")
        numContrato = empenho.get("numContrato")
        
        if anoContrato and numContrato:
            # Adicionar ao conjunto como uma tupla (imutável)
            contratos_unicos.add((anoContrato, numContrato))
    
    print(f"Encontrados {len(contratos_unicos)} contratos únicos para '{razao_social}'")
    
    # Lista para armazenar os dados dos contratos
    dados_contratos = []
    
    # Buscar informações para cada contrato único
    for anoContrato, numContrato in contratos_unicos:
        try:
            # Buscar detalhes do contrato
            params_contrato = {
                "anoContrato": anoContrato,
                "codContrato": numContrato
            }
            
            contrato_resp = requests.get(
                contrato_url, 
                headers=headers, 
                params=params_contrato, 
                timeout=15
            )
            contrato_resp.raise_for_status()
            contrato_data = contrato_resp.json()
            contratos = contrato_data.get("lstContratos", [])
            
            if contratos:
                # Adicionar informações básicas sobre o contrato
                contrato_info = {
                    "anoContrato": anoContrato,
                    "numContrato": numContrato,
                    "dados": contrato_data,
                    "detalhes": contratos[0],  # Primeiro contrato da lista
                    # Calcular valor do contrato
                    "valor": calcular_valor_contrato(contratos[0])
                }
                dados_contratos.append(contrato_info)
                
                # Salvar os dados do contrato em um arquivo JSON
                salvar_contrato_json(razao_social, anoContrato, numContrato, contrato_data)
                
        except Exception as e:
            print(f"Erro ao buscar contrato {anoContrato}/{numContrato} para {razao_social}: {str(e)}")
    
    return dados_contratos

@app.route("/buscar_dados", methods=["POST"])
def buscar_dados_razao_social():
    try:
        data = request.get_json()
        anoEmpenho = data.get("anoEmpenho")
        codorgao = data.get("codorgao")
        mesEmpenho = 12  # Valor padrão
        
        print(f"Buscando dados para todas as razões sociais: ano={anoEmpenho}, orgao={codorgao}")
        
        # Buscar empenhos para todas as razões sociais
        resultado_empenhos = buscar_empenhos_todas_razoes_sociais(anoEmpenho, mesEmpenho, None, codorgao)
        
        if "error" in resultado_empenhos:
            return jsonify({"error": resultado_empenhos["error"]}), 404
            
        # Lista para armazenar os resultados finais (contratos individuais)
        contratos_formatados = []
        
        # Processar cada razão social e seus empenhos
        for resultado in resultado_empenhos["resultados"]:
            razao_social = resultado["razao_social"]
            total_empenhado = resultado["total_empenhado"]
            empenhos = resultado["empenhos"]
            
            # Buscar todos os contratos para esta razão social
            contratos = buscar_todos_contratos_por_razao_social(razao_social, empenhos)
            
            # Identificar empenhos sem contrato (numContrato = -1) ou valores nulos/vazios
            empenhos_sem_contrato = [
                emp for emp in empenhos if 
                emp.get("numContrato") == -1 or  # Identificação específica para "Sem Contrato"
                emp.get("numContrato") is None or 
                emp.get("anoContrato") is None or
                str(emp.get("numContrato")).strip() == "" or
                str(emp.get("anoContrato")).strip() == ""
            ]
            
            # Identificar empenhos com contrato válido
            empenhos_com_contrato = [emp for emp in empenhos if emp not in empenhos_sem_contrato]
            
            # Processar empenhos sem contrato
            if empenhos_sem_contrato:
                # Calcular valor total dos empenhos sem contrato
                valor_empenhado_sem_contrato = sum(
                    float(emp.get("valTotalEmpenhado") or 0) for emp in empenhos_sem_contrato
                )
                
                valor_anulado_empenho = sum(
                    float(emp.get("valAnuladoEmpenho") or 0) for emp in empenhos_sem_contrato
                )
                
                valor_empenhado_sem_contrato = valor_empenhado_sem_contrato - valor_anulado_empenho
                
                # Adicionar à lista de resultados como "Sem Contrato"
                contratos_formatados.append({
                    "empresa": razao_social,
                    "anoContrato": "SC",  # "SC" para Sem Contrato em vez de "N/A"
                    "numContrato": "0",  # Usar "0" para permitir ordenação numérica
                    "total_empenhado": valor_empenhado_sem_contrato,
                    "detalhes_contrato": {
                        "modalidade": "Sem Contrato",
                        "tipoContratacao": "Empenho Direto",
                        "objetoContrato": "Empenhos sem contrato associado",
                        "vigenciaInicial": "",
                        "vigenciaFinal": ""
                    },
                    "quantidade_empenhos": len(empenhos_sem_contrato),
                    "identificador_unico": f"{razao_social}_sem_contrato",
                    "sem_contrato": True  # Flag para identificar itens sem contrato
                })
            
            # Processar contratos encontrados (se houver)
            if contratos:
                # Para cada contrato encontrado, criar um item separado
                for contrato in contratos:
                    # Preparar informações para empenhos associados a este contrato específico
                    empenhos_do_contrato = [
                        emp for emp in empenhos_com_contrato 
                        if emp.get("anoContrato") == contrato["anoContrato"] 
                        and emp.get("numContrato") == contrato["numContrato"]
                    ]
                    
                    # Calcular valor empenhado para este contrato específico
                    valor_empenhado_contrato = sum(
                        float(emp.get("valTotalEmpenhado") or 0) for emp in empenhos_do_contrato
                    )
    
                    valor_anulado_empenho = sum(
                        float(emp.get("valAnuladoEmpenho") or 0) for emp in empenhos_do_contrato
                    )
    
                    valor_empenhado_contrato = valor_empenhado_contrato - valor_anulado_empenho
                    
                    # Adicionar à lista de resultados
                    contratos_formatados.append({
                        "empresa": razao_social,
                        "anoContrato": contrato["anoContrato"],
                        "numContrato": contrato["numContrato"],
                        "total_empenhado": valor_empenhado_contrato,
                        "detalhes_contrato": {
                            "modalidade": contrato["detalhes"].get("txtDescricaoModalidade", ""),
                            "tipoContratacao": contrato["detalhes"].get("txtTipoContratacao", ""),
                            "codigoProcesso": contrato["detalhes"].get("codProcesso", ""),
                            "objetoContrato": contrato["detalhes"].get("txtObjetoContrato", ""),
                            "codEmpresa": contrato["detalhes"].get("codEmpresa", ""),
                            "codTipoContratacao": contrato["detalhes"].get("codTipoContratacao", ""),
                            "valReajustes": contrato["detalhes"].get("valReajustes", ""),
                            "codModalidade": contrato["detalhes"].get("codModalidade", ""),
                            "datVigencia": contrato["detalhes"].get("datVigencia",""),
                            "codOrgao": contrato["detalhes"].get("codOrgao"),
                            "txtDescricaoOrgao": contrato["detalhes"].get("txtDescricaoOrgao")
                        },
                        "quantidade_empenhos": len(empenhos_do_contrato),
                        "identificador_unico": f"{razao_social}_{contrato['anoContrato']}_{contrato['numContrato']}"
                    })
                
            # Verificar se existem empenhos com contratos que não foram processados anteriormente
            # (isso pode acontecer se houver erro na API de contratos)
            empenhos_com_contrato_nao_processados = [
                emp for emp in empenhos_com_contrato  # Usar a lista filtrada que não inclui 'numContrato = -1'
                if emp.get("anoContrato") and 
                   emp.get("numContrato") and 
                   emp.get("numContrato") != -1 and  # Garantir que não é um "Sem Contrato"
                   (not contratos or not any(contrato["anoContrato"] == emp.get("anoContrato") and 
                                          contrato["numContrato"] == emp.get("numContrato") for contrato in contratos))
            ]
            
            # Agrupar por pares de (anoContrato, numContrato)
            contratos_nao_processados = {}
            for emp in empenhos_com_contrato_nao_processados:
                chave = (emp.get("anoContrato"), emp.get("numContrato"))
                if chave not in contratos_nao_processados:
                    contratos_nao_processados[chave] = []
                contratos_nao_processados[chave].append(emp)
            
            # Processar cada grupo de empenhos com o mesmo contrato
            for (ano_contrato, num_contrato), empenhos_grupo in contratos_nao_processados.items():
                valor_empenhado_grupo = sum(
                    float(emp.get("valTotalEmpenhado") or 0) for emp in empenhos_grupo
                )
                
                valor_anulado_grupo = sum(
                    float(emp.get("valAnuladoEmpenho") or 0) for emp in empenhos_grupo
                )
                
                valor_empenhado_grupo = valor_empenhado_grupo - valor_anulado_grupo
                
                # Adicionar à lista de resultados
                contratos_formatados.append({
                    "empresa": razao_social,
                    "anoContrato": ano_contrato,
                    "numContrato": num_contrato,
                    "total_empenhado": valor_empenhado_grupo,
                    "detalhes_contrato": {
                        "modalidade": "Informações indisponíveis",
                        "tipoContratacao": "Informações indisponíveis",
                        "objetoContrato": "Detalhes do contrato indisponíveis",
                        "codigoProcesso": "",
                        "vigenciaFinal": ""
                    },
                    "quantidade_empenhos": len(empenhos_grupo),
                    "identificador_unico": f"{razao_social}_{ano_contrato}_{num_contrato}_indisponível"
                })
        
        # Ordenar por valor total empenhado (decrescente)
        contratos_formatados.sort(key=lambda x: x["total_empenhado"], reverse=True)
        
        # Salva o resultado final em um arquivo JSON
        with open("resultado_completo.json", "w", encoding="utf-8") as f:
            json.dump({"resultados": contratos_formatados}, f, ensure_ascii=False, indent=4)
        
        return jsonify({"resultados": contratos_formatados})
            
    except Exception as e:
        print(f"Erro na rota buscar_dados: {str(e)}")
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=80, debug=True)