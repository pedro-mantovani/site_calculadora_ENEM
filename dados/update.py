import json
import pandas as pd

# 1. Carregar as estimativas do arquivo CSV
df_est = pd.read_csv('estimativas_finais.csv')

# 2. Carregar o arquivo JSON com as provas mapeadas
with open('provas_mapeadas.json', 'r', encoding='utf-8') as f:
    provas = json.load(f)

# 3. Criar um dicionário indexado pelo código da prova para acesso rápido aos erros
# 'mae' corresponde ao Erro Médio e 'erro_max' corresponde ao Erro Máximo
map_est = df_est.set_index('codigo').to_dict(orient='index')

# 4. Atualizar cada objeto de prova no JSON
for prova in provas:
    cod = prova.get('codigo')
    if cod in map_est:
        # Arredonda para 4 casas decimais para manter o JSON legível e conciso
        prova['erro_medio'] = round(float(map_est[cod]['mae']), 4)
        prova['erro_maximo'] = round(float(map_est[cod]['erro_max']), 4)
    else:
        prova['erro_medio'] = None
        prova['erro_maximo'] = None

# 5. Sobrescrever o arquivo provas_mapeadas.json com os novos dados
with open('provas_mapeadas.json', 'w', encoding='utf-8') as f:
    json.dump(provas, f, ensure_ascii=False, indent=2)

print("Arquivo 'provas_mapeadas.json' atualizado com sucesso!")