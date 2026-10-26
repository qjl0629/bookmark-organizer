<p align="center">
  <img src="extension/icons/icon-128.png" width="84" alt="Marksly logo">
</p>

<h1 align="center">Marksly · 书签整理师</h1>

<p align="center"><b>收藏夹，自己会整理。</b><br>
每一步先预览，一键撤销。全程在本地运行：不用账号，不用 API Key，不上传任何数据。</p>

<p align="center"><a href="README.md">English</a></p>

<p align="center">
  <img src="docs/demo.gif" alt="Marksly 几下点击整理乱糟糟的收藏夹" width="760">
</p>

书签存了几百条，没时间整理，还有不少放错了文件夹。Marksly 会读你**已有文件夹里的内容**，给出整理方案，并且**在动手之前，把每一步都写成“现在在哪 → 该去哪”**。你可以逐条勾选，也可以直接点 **Tidy up everything**，整理完还能一键撤销。

## 它能做什么

| | |
|---|---|
| 🔍 **揪出放错文件夹的书签** | 炒菜食谱躺在“购物”里，房贷文章混在“健康”里。它看的是内容，不只是网址，并且会学习**你自己**每个文件夹是干什么的。 |
| ⬆️ **常用的置顶** | 每个文件夹里，你最常点开的排到最上面；其余保持原顺序，新存的仍在最下面。常用的文件夹也会往前排。 |
| 🗄️ **吃灰的收起来** | 保存超过一年、之后没打开过的，建议放进 `Archive` 文件夹（不删除，也不会替你勾选）。 |
| 🧹 **整理文件夹本身** | 删除空文件夹，合并重复的（Recipe 和 Recipes），把“New folder”按里面的内容改成合适的名字。 |
| 📌 **快捷方式不乱动** | 书签栏上的 Gmail、ChatGPT 这类“点开就用”的，一律原地不动。 |
| ↩️ **一键撤销** | 每个位置都能复原，包括被合并、被删除的文件夹。 |

<p align="center">
  <img src="docs/shot-2-misfiled.png" width="760" alt="放错文件夹的书签，每条都写明现在在哪、该去哪">
</p>

## 隐私

- **不用账号，不用 API Key，没有服务器。** 你的书签不会离开这台电脑。
- **“看懂内容”靠一个内置的小模型（约 8 MB）**，直接打包在插件里（[`potion-base-8M`](https://huggingface.co/minishlab/potion-base-8M)，MIT 协议），在浏览器里离线运行。
- **有自动化测试守着：** 一旦有人往插件里加了联网代码，测试就会失败（读取自带文件除外）。
- 权限只有 `bookmarks` 和 `storage`。浏览历史是**可选**权限，只用来统计你访问某个书签的次数，点按钮才会请求，也可以随时关掉。详见 [PRIVACY.md](PRIVACY.md)。

## 安装

目前还没上架 Chrome 应用商店，先从源码安装（大约一分钟）：

1. [下载本仓库的 ZIP](../../archive/refs/heads/main.zip)，解压。
2. 地址栏打开 `chrome://extensions`，打开右上角的 **开发者模式**。
3. 点 **加载已解压的扩展程序**，选择解压出来的 `extension` 文件夹。
4. 点击工具栏上的 Marksly 图标。

你确认之前不会改动任何东西，整理完也能在同一个页面撤销。

## 和别的工具有什么不同

市面上有不少书签工具：有的把书签发给在线 AI 来分类，需要 API Key；有的侧重搜索或新标签页。Marksly 的定位更窄：**完全本地、每一步先预览、一键撤销，并且重点放在“已经放错了地方”的书签**，不只是帮新书签归类。如果你想要大语言模型生成文件夹名，或者检测失效链接，那些工具能做，Marksly 目前不做。

## 实话实说：局限

- 内置模型懂的是日常话题（美食、旅行、理财、健康、常见编程词）。**不认识**较新或很专门的产品，比如它不知道 “Copilot Studio” 属于 “Power Platform”。少于 4 个书签的文件夹没法判断。
- “常用置顶”和“Archive”依赖 Chrome 114+ 记录的**最后打开时间**。Chrome 没有记录的，Marksly 不会瞎猜：有记录的书签太少时，Archive 建议会自动关闭。
- Chrome 没有真正的隐藏书签。`Archive` 放在“其他书签”下面（不在书签栏上），但在书签管理器里仍然看得到，也会同步。
- 测试数据是我虚构的，不是你的：在调参用的那个库里，14 个故意放错的找出了 11 个；在没调过参的库里，8 个找出了 7 个，没有误报。详见 [docs/how-it-works.md](docs/how-it-works.md)（英文）。

## 开发

不需要构建，没有依赖。

```bash
node --test extension/tests/*.test.js    # Node 22+
```

不想动自己的书签，可以先看演示：在仓库根目录启动一个本地服务，用浏览器打开页面，会加载虚构的演示数据：

```bash
python3 -m http.server 8765
# 打开 http://127.0.0.1:8765/extension/organizer.html
```

欢迎在 [Issues](../../issues) 里提建议和 bug。

## 许可

MIT。内置模型 [`minishlab/potion-base-8M`](https://huggingface.co/minishlab/potion-base-8M) 同样是 MIT。
