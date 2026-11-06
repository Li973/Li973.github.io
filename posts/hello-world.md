## 这里先占个位置

网站刚搭好，真正的笔记还都躺在草稿箱里。等关于 **AI Infra**、**RL Infra** 的第一篇东西写完，这个位置就会换成正文。

在此之前，先随便写几句，顺便把排版和公式都试一遍。

### 一点点数学

行内公式可以直接写，比如一个带权求和 $f(x)=\sum_{i=1}^{n} w_i x_i + b$，或者策略梯度里常见的 $\nabla_\theta \log \pi_\theta(a\mid s)$。

独立成行的公式：

$$
\mathcal{L}(\theta) = \mathbb{E}_{t}\left[ \min\left( r_t(\theta)\hat{A}_t,\ \mathrm{clip}(r_t(\theta), 1-\epsilon, 1+\epsilon)\hat{A}_t \right) \right]
$$

多行对齐也没问题：

$$
\begin{aligned}
\nabla_\theta J(\theta) &\approx \frac{1}{N}\sum_{i=1}^{N} \nabla_\theta \log \pi_\theta(a_i \mid s_i)\, \hat{A}_i, \\
\theta_{k+1} &= \theta_k + \alpha\, \nabla_\theta J(\theta_k).
\end{aligned}
$$

> 如果上面这些是排版好的公式，而不是一堆美元符号和反斜杠，说明 MathJax 已经在正常工作了。

### 以后怎么加文章

1. 在 `posts/` 里新建一个 `.md` 文件，正文用 Markdown 写；
2. 在 `posts/index.json` 的 `posts` 数组最前面加一条记录，填好 `title`、`summary`、`date`、`tags`、`file`；
3. 推送到 `main`，GitHub Pages 会自动更新。

公式用 `$...$` 包行内、`$$...$$` 包独立公式，支持 `\begin{aligned}`、`\sum`、`\mathbb{}` 这类常用 LaTeX 写法。

---

*暂时就这样，回头见。*
