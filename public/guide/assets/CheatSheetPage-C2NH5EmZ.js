import{i as e,n as t,t as n}from"./jsx-runtime-bzQ4Vb5N.js";import{t as r}from"./calculator-CiuW-IVt.js";import{t as i}from"./check-CGpRcH0y.js";import{t as a}from"./code-DwzY004e.js";import{t as o}from"./copy-Dr-MR1Nn.js";import{t as s}from"./database-BanLmgSb.js";import{t as c}from"./terminal-DA0o6m_X.js";import{n as l}from"./index-D38qCiDD.js";var u=e(t(),1),d=n(),f=[{icon:c,title:`环境一键搭建`,color:`text-brand-accent`,items:[{label:`Conda 环境`,code:`conda create -n bioml python=3.10 -y && conda activate bioml
pip install torch scikit-learn xgboost pandas numpy matplotlib
pip install transformers biopython scanpy scvi-tools
pip install deepchem rdkit jupyterlab wandb`}]},{icon:s,title:`数据加载速查`,color:`text-brand-dl`,items:[{label:`DNA 序列 (FASTA)`,code:`from Bio import SeqIO
for record in SeqIO.parse("genome.fasta", "fasta"):
    print(record.id, len(record.seq))`},{label:`基因表达矩阵 (CSV)`,code:`import pandas as pd
expr = pd.read_csv("TCGA_expr.csv", index_col=0)
print(f"Genes: {expr.shape[0]}, Samples: {expr.shape[1]}")`},{label:`单细胞数据 (10x h5)`,code:`import scanpy as sc
adata = sc.read_10x_h5("pbmc3k_filtered_gene_bc_matrices.h5")
sc.pp.filter_cells(adata, min_genes=200)`},{label:`蛋白质结构 (PDB)`,code:`from Bio.PDB import PDBParser
parser = PDBParser()
structure = parser.get_structure("protein", "1abc.pdb")`},{label:`分子 SMILES`,code:`from rdkit import Chem
mol = Chem.MolFromSmiles("CC(=O)OC1=CC=CC=C1C(=O)O")
print(f"Atoms: {mol.GetNumAtoms()}")`}]},{icon:c,title:`NGS / 多组学流程`,color:`text-brand-dl`,items:[{label:`FastQC/MultiQC`,code:`mkdir -p qc/fastqc qc/multiqc
fastqc -t 8 -o qc/fastqc fastq/*.fastq.gz
multiqc qc/fastqc -o qc/multiqc`},{label:`Bowtie2`,code:`bowtie2 --end-to-end --very-sensitive --no-mixed --no-discordant \\
  --phred33 -I 10 -X 700 -p 8 -x indexes/hg38 \\
  -1 sample_R1.fastq.gz -2 sample_R2.fastq.gz \\
  -S align/sample.sam 2> align/sample.bowtie2.txt`},{label:`samtools`,code:`samtools view -bS -F 0x04 align/sample.sam > align/sample.mapped.bam
samtools sort -@ 8 -o align/sample.sorted.bam align/sample.mapped.bam
samtools index align/sample.sorted.bam
samtools flagstat align/sample.sorted.bam > qc/sample.flagstat.txt`},{label:`bedtools`,code:`bedtools bamtobed -bedpe -i align/sample.mapped.bam > bed/sample.bedpe
awk '$1==$4 && $6-$2 < 1000 {print $1"\\t"$2"\\t"$6}' bed/sample.bedpe \\
  | sort -k1,1 -k2,2n -k3,3n > bed/sample.fragments.bed
bedtools genomecov -bg -i bed/sample.fragments.bed -g refs/hg38.chrom.sizes \\
  > signal/sample.bedgraph`},{label:`SEACR`,code:`bash SEACR_1.3.sh signal/sample.bedgraph signal/IgG.bedgraph \\
  norm stringent peaks/sample_seacr`},{label:`deepTools`,code:`bamCoverage -b align/sample.sorted.bam -o signal/sample.bw --binSize 10 -p 8
computeMatrix reference-point -S signal/sample.bw -R peaks/sample.bed \\
  --referencePoint center -a 3000 -b 3000 -o matrix/sample.mat.gz -p 8
plotHeatmap -m matrix/sample.mat.gz -out plots/sample_peak_heatmap.png`},{label:`DESeq2`,code:`library(DESeq2)
cts <- read.csv("matrix/counts.csv", row.names = 1)
meta <- read.csv("metadata/sample_metadata.csv", row.names = 1)
dds <- DESeqDataSetFromMatrix(countData = cts, colData = meta, design = ~ condition)
dds <- dds[rowSums(counts(dds)) > 5, ]
dds <- DESeq(dds)
res <- results(dds, contrast = c("condition", "treated", "control"))
write.csv(as.data.frame(res), "results/deseq2_results.csv")`},{label:`peak annotation`,code:`library(ChIPseeker)
library(TxDb.Hsapiens.UCSC.hg38.knownGene)
peak <- readPeakFile("peaks/sample.bed")
anno <- annotatePeak(peak, TxDb = TxDb.Hsapiens.UCSC.hg38.knownGene,
                     tssRegion = c(-3000, 3000))
write.csv(as.data.frame(anno), "results/peak_annotation.csv")`}]},{icon:a,title:`ML 常用模式`,color:`text-brand-accent`,items:[{label:`训练/测试划分 + 交叉验证`,code:`from sklearn.model_selection import train_test_split, cross_val_score
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)
scores = cross_val_score(RandomForestClassifier(), X, y, cv=5)
print(f"CV Accuracy: {scores.mean():.3f} ± {scores.std():.3f}")`},{label:`特征标准化 + 分类流水线`,code:`from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
pipe = Pipeline([("scaler", StandardScaler()),
                 ("svm", SVC(kernel="rbf"))])
pipe.fit(X_train, y_train)`},{label:`超参数网格搜索`,code:`from sklearn.model_selection import GridSearchCV
params = {"n_estimators": [100, 200], "max_depth": [5, 10]}
gs = GridSearchCV(RandomForestClassifier(), params, cv=5)
gs.fit(X_train, y_train)
print(f"Best: {gs.best_params_}")`},{label:`SHAP 模型解释`,code:`import shap
explainer = shap.TreeExplainer(model)
shap_values = explainer.shap_values(X_test)
shap.summary_plot(shap_values, X_test, feature_names=features)`}]},{icon:l,title:`DL 常用模式`,color:`text-brand-purple`,items:[{label:`PyTorch 训练循环`,code:`import torch, torch.nn as nn
model = MyModel()
optimizer = torch.optim.Adam(model.parameters(), lr=1e-4)
loss_fn = nn.CrossEntropyLoss()

for epoch in range(epochs):
    optimizer.zero_grad()
    output = model(X_batch)
    loss = loss_fn(output, y_batch)
    loss.backward()
    optimizer.step()`},{label:`HuggingFace 加载预训练模型`,code:`from transformers import AutoTokenizer, AutoModel
tokenizer = AutoTokenizer.from_pretrained("facebook/esm2_t33_650M_UR50D")
model = AutoModel.from_pretrained("facebook/esm2_t33_650M_UR50D")
inputs = tokenizer("MKTVRQERL", return_tensors="pt")
with torch.no_grad():
    embeddings = model(**inputs).last_hidden_state`},{label:`GPU 检查与转移`,code:`device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = model.to(device)
X_batch, y_batch = X_batch.to(device), y_batch.to(device)
print(f"Using: {device}, GPU: {torch.cuda.get_device_name(0)}")`},{label:`scVI 单细胞批次校正`,code:`import scvi
scvi.model.SCVI.setup_anndata(adata, batch_key="batch")
model = scvi.model.SCVI(adata, n_latent=30)
model.train()
adata.obsm["X_scVI"] = model.get_latent_representation()`}]},{icon:r,title:`数学公式 → 代码`,color:`text-brand-error`,items:[{label:`One-Hot 编码 DNA 序列`,code:`import numpy as np
seq = "ATCG"
mapping = {"A": 0, "T": 1, "C": 2, "G": 3}
one_hot = np.zeros((4, len(seq)))
for i, base in enumerate(seq):
    one_hot[mapping[base], i] = 1
# Shape: (4, 4) — 一行一个碱基类型`},{label:`Softmax 概率输出`,code:`import numpy as np
def softmax(x):
    e_x = np.exp(x - np.max(x))
    return e_x / e_x.sum()
logits = np.array([2.0, 1.0, 0.1])
probs = softmax(logits)  # [0.66, 0.24, 0.10]`},{label:`交叉熵损失`,code:`import numpy as np
def cross_entropy(y_true, y_pred):
    return -np.sum(y_true * np.log(y_pred + 1e-15))
# y_true = [1, 0, 0], y_pred = [0.7, 0.2, 0.1]
# -> -log(0.7) = 0.357`},{label:`SGD 一步更新`,code:`theta = theta - learning_rate * gradient
# PyTorch: optimizer.step() 自动完成
# NumPy 手动实现:
# w = w - lr * dw`},{label:`PCA via SVD`,code:`import numpy as np
# X: (n_samples, n_features), 已中心化
U, S, Vt = np.linalg.svd(X, full_matrices=False)
X_pca = U[:, :k] * S[:k]  # 前k个主成分
explained_var = S[:k]**2 / np.sum(S**2)`}]},{icon:l,title:`生物信息学特有操作`,color:`text-brand-dl`,items:[{label:`DNA k-mer 特征提取`,code:`from sklearn.feature_extraction.text import CountVectorizer
vec = CountVectorizer(analyzer="char", ngram_range=(3, 3))
X = vec.fit_transform(["ATCGGGCTA", "GCTTAACCG"])
# X: (2, n_unique_kmers) 稀疏矩阵`},{label:`蛋白质序列 → ESM 嵌入`,code:`from transformers import AutoTokenizer, AutoModel
model = AutoModel.from_pretrained("facebook/esm2_t33_650M_UR50D")
tokenizer = AutoTokenizer.from_pretrained("facebook/esm2_t33_650M_UR50D")
inputs = tokenizer(["MKTVRQER", "MKTVRQPR"], return_tensors="pt", padding=True)
emb = model(**inputs).last_hidden_state.mean(dim=1)  # (2, 1280)`},{label:`差异基因表达 (PyDESeq2)`,code:`from pydeseq2.dds import DeseqDataSet
from pydeseq2.ds import DeseqStats
dds = DeseqDataSet(counts=count_df, metadata=meta_df, design="~condition")
dds.deseq2()
stat = DeseqStats(dds, contrast=["condition", "treated", "control"])
stat.summary()  # log2FC, pvalue, padj`},{label:`GSEA 通路富集`,code:`import gseapy as gp
genes = ["TP53", "BRCA1", "EGFR", "MYC", "PTEN"]
enr = gp.enrichr(gene_list=genes,
                 gene_sets="KEGG_2021_Human",
                 organism="human")
enr.results[["Term", "Adjusted P-value"]].head(10)`}]}];function p(){let[e,t]=(0,u.useState)(null),n=(e,n)=>{try{navigator.clipboard.writeText(n).then(()=>{t(e),setTimeout(()=>t(null),2e3)})}catch{t(e),setTimeout(()=>t(null),2e3)}};return(0,d.jsxs)(`div`,{className:`space-y-12`,children:[(0,d.jsxs)(`div`,{children:[(0,d.jsx)(`h1`,{className:`text-3xl font-bold mb-3 text-brand-ink`,children:`速查表`}),(0,d.jsx)(`p`,{className:`text-base text-brand-ink-muted max-w-[600px]`,children:`生物信息学 ML/DL 常用命令、代码模式和公式的快速参考`})]}),(0,d.jsx)(`div`,{className:`space-y-10`,children:f.map(t=>(0,d.jsxs)(`section`,{children:[(0,d.jsxs)(`div`,{className:`flex items-center gap-2.5 mb-4`,children:[(0,d.jsx)(t.icon,{size:18,className:t.color}),(0,d.jsx)(`h2`,{className:`text-lg font-bold text-brand-ink`,children:t.title})]}),(0,d.jsx)(`div`,{className:`space-y-3`,children:t.items.map(t=>(0,d.jsxs)(`div`,{className:`border rounded-lg overflow-hidden border-brand-border`,children:[(0,d.jsxs)(`div`,{className:`flex items-center justify-between px-3 py-1.5 bg-brand-off-white`,style:{borderBottom:`1px solid #EEEEEE`},children:[(0,d.jsx)(`span`,{className:`text-xs font-medium text-brand-ink-light`,children:t.label}),(0,d.jsx)(`button`,{onClick:()=>n(t.label,t.code),className:`p-1 rounded hover:bg-gray-100 transition-colors`,title:`Copy`,children:e===t.label?(0,d.jsx)(i,{size:13,className:`text-brand-dl`}):(0,d.jsx)(o,{size:13,className:`text-brand-ink-muted`})})]}),(0,d.jsx)(`pre`,{className:`m-0 px-3 py-2 font-mono text-xs overflow-x-auto bg-[#FCFCFC] text-brand-ink-light`,style:{whiteSpace:`pre`,maxHeight:200},children:t.code})]},t.label))})]},t.title))}),(0,d.jsxs)(`section`,{className:`border rounded-lg p-6 border-brand-border bg-brand-off-white`,children:[(0,d.jsx)(`h2`,{className:`text-sm font-semibold mb-3 text-brand-ink`,children:`常用命令速记`}),(0,d.jsx)(`div`,{className:`grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono text-brand-ink-light`,children:[{cmd:`pip list | grep torch`,desc:`检查 PyTorch 版本`},{cmd:`nvidia-smi`,desc:`查看 GPU 状态`},{cmd:`conda env list`,desc:`列出所有 conda 环境`},{cmd:`jupyter lab --port=8888`,desc:`启动 JupyterLab`},{cmd:`python -c "import torch; print(torch.cuda.is_available())"`,desc:`检查 CUDA 可用性`},{cmd:`tensorboard --logdir=runs`,desc:`启动 TensorBoard`},{cmd:`wandb login`,desc:`登录 Weights & Biases`},{cmd:`du -sh data/`,desc:`查看数据目录大小`}].map(e=>(0,d.jsxs)(`div`,{className:`flex items-start gap-2`,children:[(0,d.jsx)(`code`,{className:`shrink-0 px-1.5 py-0.5 rounded bg-brand-border-light`,children:e.cmd}),(0,d.jsx)(`span`,{className:`text-xs text-brand-ink-muted`,children:e.desc})]},e.cmd))})]})]})}export{p as default};