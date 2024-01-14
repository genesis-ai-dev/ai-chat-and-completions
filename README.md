# MINI AI PILOT: 支持本地大模型的极简AI编程助手

## 示例
![演示Gif](./demo.gif)

## 特性 🔥
- 适用于本地部署且与OpenAI的API兼容的的LLM
- 支持代码补全功能
- 支持chat功能
- 支持选中代码进行问答
- 支持Windows系统

## 安装 ⬇️
- 在Visual Studio Code扩展市场中搜索 "Mini AI Pilot", 点击安装。
- 部署一个与OpenAI的API兼容的本地LLM服务器。
  - 您可以选择设置自己的LLM服务器，只要它能与OpenAI的接口兼容。
  - 建议使用[text-generation-webui](https://github.com/oobabooga/text-generation-webui)部署自己的LLM，模型推荐使用[deepseek-coder-instruct](https://github.com/deepseek-ai/DeepSeek-Coder)模型。如果您的计算机配置较高，可使用33B的模型，否则建议使用6.7B或1.3B的模型。
  - 如果您不会部署或存在困难，可下载使用我已经配置和打包的[版本](https://pan.baidu.com/s/16uU5ToqEHEaMtFJbF05EGg?pwd=1234)，解压后只需要双击start_windows.bat即可启动服务。为了能适配更多的人计算机，默认使用1.3B的版本。

## 使用 🚀
- 代码补全: 按热键 "Alt+Q" 或从右键菜单中选择 "自动补全" 选项。然后，按 "Tab" 输入代码。
- AI聊天: 该功能可以从侧边栏菜单中访问。另外，你可以选择代码段并就其提问。

## 常见问题
#### Q: 单次查询支持多少字符或token？
A: 单次输入的最大长度为4000个字符。chat功能中，超过4000个字符将无法继续输入，代码补全功能中，超过4000个字符将自动截断。
#### Q: 电脑需要什么配置才可以部署本地LLM？
A: 目前笔者测试中，最低4G显存可以无压力使用1.3B的模型。如果您的电脑配置更差，可以把CMD_FLAGS.txt中的n-gpu-layers后面的36修改为0，将会完全使用CPU进行计算，但注意这样速度会大幅下降。
#### Q: 代码补全为什么感觉比问答慢？
A: 代码补全不是流式的，全部生成后才会返回结果，其实与流式返回速度一致。并且生成速度与您的计算机配置有关，如果您的计算机配置较差，建议您按Alt+Q后，静静等待片刻。
#### Q: 支持在线LLM吗？比如OpenAI的API？
A: 本插件目前仅支持本地大模型，因为笔者的主要痛点是代码插件的安全性问题。后面会考虑增加对在线大模型接口的支持。
#### Q: 支持输入或换行后自动触发代码补全吗？
A: 本插件仅支持主动触发补全(Alt+Q或右键菜单)，因为笔者在使用其他插件过程中，被自动补全搞得很凌乱。
#### Q: 支持哪些操作系统？
A: 笔者打包上传的LLM一键部署包，只支持Windows系统。如果需要在其他系统上使用，自行按照[text-generation-webui](https://github.com/oobabooga/text-generation-webui)的官方文档进行安装部署即可。
#### Q: 除了DeepSeek-Coder是否支持其他模型？
A: 本插件在实现代码中补全时，使用了DeepSeek的prompt template，其他模型可能不适用。但聊天功能适用于任何模型。后面版本中会针对这个问题进行优化，以适配更多模型。

## 建议与反馈
对于任何建议或反馈，可通过wuwei_nero@163.com与我联系或在issues中留言。

## 许可
该项目使用MIT License授权。