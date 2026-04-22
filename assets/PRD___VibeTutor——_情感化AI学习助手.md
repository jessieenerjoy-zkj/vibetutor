# PRD | VibeTutor — 情感化AI学习助手

## 1. 📝 背景

### 现状（As-Is）

- 现有拍照搜题/解题工具仅提供冷冰冰的答案，缺乏对学生情绪的关怀，导致学生在情绪低落或卡壳时容易放弃。

- 学生每天的学习状态（崩溃、卡住、平稳、投入、亢奋）各不相同，但工具始终以同一语气交互，无法适配用户当下的心理需求。

- 学习进度缺乏趣味化反馈，学生难以获得持续动力。

- 市场上缺乏将“情绪感知 + 游戏化进度 + 人格化AI导师”三者结合的产品。

### 机会（Opportunity）

- 利用AI大模型（GPT-4o-mini）低成本实现多变的导师人格和情绪化洞察。

- 通过情绪选择 + 水滴进度 + 人格推荐，构建“懂你、陪你、激励你”的学习闭环，提升用户粘性与学习完成率。

- 可快速验证情感化学习助手的市场接受度，为后续个性化学习产品奠基。

---

## 2. 🎯 目标

1. **功能目标**：搭建一款移动端优先的Web App，包含首页情绪记录、Learning Drop 进度、AI 洞察、情绪处方签 Banner，以及 AI Tutor 人格对话与 Profile 中的 Mind Garden 长线成长模块。

2. **体验目标**：用户能在30秒内完成情绪选择 + 首次题目提问，并获得符合当下情绪的人格回复。

3. **数据目标（MVP）**：
	- 日活跃用户（DAU）完成情绪记录率 > 80%
	- 平均每日提问次数（含拍题）≥ 3次
	- Learning Drop 单日达标用户比例 ≥ 30%
	- Mind Garden 图章解锁用户比例持续提升

4. **技术目标**：2天内完成可演示原型，所有数据本地存储，API调用稳定，无后端依赖。

---

## 3. 🔭 范围

<table col-widths="200,287,200">
    <tr>
        <td>端/角色</td>
        <td>包含范围</td>
        <td>不包含范围</td>
    </tr>
    <tr>
        <td>**学生（前端）**</td>
        <td>首页（MOTD、情绪选择、情绪处方签 Banner、Learning Drop、AI洞察）；AI Tutor页面（人格切换、聊天、图片上传）；Profile页面（心情趋势、Mind Garden、学习统计）。</td>
        <td>语音输入/输出、社交分享、后端账号系统、跨设备同步。</td>
    </tr>
    <tr>
        <td>**管理后台**</td>
        <td>无（MVP无后台）。</td>
        <td>所有后台管理功能。</td>
    </tr>
    <tr>
        <td>**API集成**</td>
        <td>OpenAI API（GPT-4o-mini文本模型 + GPT-4V图片理解）。</td>
        <td>自训练模型、其他AI服务。</td>
    </tr>
</table>

---

## 4. 🔗 流程

### 4.1 业务流程图（用户核心路径）

```
graph TD
A[打开App] --> B[首页展示MOTD]
B --> C{是否已选今日心情?}
C -->|否| D[点击心情按钮]
C -->|是| E[显示已选心情]
D --> F[存储心情至localStorage]
E --> G[展示已选心情对应的处方签 Banner]
F --> G[展示情绪处方签 Banner]
F --> H[AI洞察自动刷新]
G --> I[用户点击 Banner CTA]
I --> J[切换至 AI Tutor Tab]
J --> K[顶部导师卡片自动滚动并选中匹配人格]
K --> L[聊天区自动展示该人格打招呼消息]
L --> M[用户输入文字/上传图片]
M --> N[调用大模型 API]
N --> O{AI是否成功回复且非重复题目?}
O -->|否| P[仅展示回复或错误态，不增加水滴]
O -->|是| Q[Learning Drop +1]
Q --> R{当日是否达到 5/5?}
R -->|否| S[更新 Learning Drop 显示]
R -->|是| T[触发水滴容器盈满发光 + Toast: Daily goal met!]
T --> U{是否恰好完成当前植物阶段目标天数?}
U -->|否| V[更新 Mind Garden 当前阶段进度]
U -->|是| W[解锁新植物图章]
W --> X[触发全屏 Confetti + 高光卡片]
P --> M
S --> M
V --> M
X --> M
```

### 4.2 状态流转图（情绪、人格与成长状态映射）

```
stateDiagram-v2
    [*] --> 首页待选择心情
    首页待选择心情 --> 已选Crushed: 选择崩溃
    首页待选择心情 --> 已选Stuck: 选择卡住
    首页待选择心情 --> 已选Calm: 选择平稳
    首页待选择心情 --> 已选Engaged: 选择投入
    首页待选择心情 --> 已选Hyper: 选择亢奋

    已选Crushed --> Banner_Gentle: 展示处方签 Banner
    已选Stuck --> Banner_WiseElder: 展示处方签 Banner
    已选Calm --> Banner_Neutral: 展示处方签 Banner
    已选Engaged --> Banner_Gordon: 展示处方签 Banner
    已选Hyper --> Banner_Trump: 展示处方签 Banner

    Banner_Gentle --> Tutor_Gentle: 点击 CTA 进入 Tutor
    Banner_WiseElder --> Tutor_WiseElder: 点击 CTA 进入 Tutor
    Banner_Neutral --> Tutor_Neutral: 点击 CTA 进入 Tutor
    Banner_Gordon --> Tutor_Gordon: 点击 CTA 进入 Tutor
    Banner_Trump --> Tutor_Trump: 点击 CTA 进入 Tutor

    Tutor_Gentle --> Greeting_Gentle: 首次进入或切换人格
    Tutor_WiseElder --> Greeting_WiseElder: 首次进入或切换人格
    Tutor_Neutral --> Greeting_Neutral: 首次进入或切换人格
    Tutor_Gordon --> Greeting_Gordon: 首次进入或切换人格
    Tutor_Trump --> Greeting_Trump: 首次进入或切换人格

    Greeting_Gentle --> Tutor_Active: 开始对话
    Greeting_WiseElder --> Tutor_Active: 开始对话
    Greeting_Neutral --> Tutor_Active: 开始对话
    Greeting_Gordon --> Tutor_Active: 开始对话
    Greeting_Trump --> Tutor_Active: 开始对话

    Tutor_Active --> Tutor_Gentle: 手动切换到 Gentle
    Tutor_Active --> Tutor_WiseElder: 手动切换到 WiseElder
    Tutor_Active --> Tutor_Neutral: 手动切换到 Neutral
    Tutor_Active --> Tutor_Gordon: 手动切换到 Gordon
    Tutor_Active --> Tutor_Trump: 手动切换到 Trump

    Tutor_Active --> Drop_Progressing: AI 成功回复且非重复题目
    Drop_Progressing --> Drop_NotFull: 当日水滴 < 5/5
    Drop_Progressing --> Drop_Full: 当日水滴达到 5/5
    Drop_NotFull --> Tutor_Active: 更新 Learning Drop
    Drop_Full --> Goal_Feedback: 发光 + Toast

    Goal_Feedback --> Garden_InProgress: 未完成当前图章阶段
    Goal_Feedback --> Stamp_Unlocked: 恰好完成当前阶段目标天数
    Garden_InProgress --> Tutor_Active: 更新 Mind Garden 进度
    Stamp_Unlocked --> Garden_Celebration: Confetti + 高光卡片
    Garden_Celebration --> Next_Stamp_Challenge: 次日开启下一阶段
    Next_Stamp_Challenge --> Tutor_Active: 继续日常学习循环
```

---

## 5. 💻 需求详情

### 5.1 首页（Home Tab）

<table col-widths="200,442,200">
    <tr>
        <td>页面模块</td>
        <td>需求详情</td>
        <td>交互/备注</td>
    </tr>
    <tr>
        <td>**Message of the Day**</td>
        <td>1. 顶部展示一句励志名言或学习Tips，每日更新（预设7条，按日期循环）。<br>2. 用户可点击❤️点赞：点赞状态按日期存储（localStorage），每天独立，取消点赞可再次点击。<br>3. 用户可点击📤分享：调用Web Share API（若支持）复制文案到剪贴板，并Toast提示“已复制”。<br>4. 文案来源：前端数组硬编码，无需网络请求。</td>
        <td>点赞按钮高亮效果（红色填充）。分享失败时提示“浏览器不支持分享，已复制”。</td>
    </tr>
    <tr>
        <td>**心情选择器**</td>
        <td>1. 5个心情按钮：崩溃(Crushed)😫、卡住(Stuck)😖、平稳(Calm)😐、投入(Engaged)😤、亢奋(Hyper)🤪。<br>2. 每天只能选择一次（可修改，但会覆盖当日记录）。<br>3. 选择后存储：`{ date: 'YYYY-MM-DD', mood: 'Crushed' }` 到localStorage的`moodHistory`数组。<br>4. 选择后立即触发：AI洞察卡片刷新、Learning Drop 模块状态刷新（含水滴微动效资格判断）、情绪处方签 Banner 展开，并生成对应的“心情→人格→治愈文案→CTA”内容。<br>5. 若当天已选，对应按钮高亮显示；当用户再次点击其他心情时，弹出确认“修改心情将覆盖今日记录，确定吗？”，确认后更新 Banner 内容与匹配人格。</td>
        <td>使用Emoji + 英文文字。修改心情时需二次确认，避免误操作。Banner 为心情选择后的首要反馈层，替代“后台默默切人格”的隐性逻辑。</td>
    </tr>
    <tr>
        <td>**情绪处方签 Banner**</td>
        <td>1. 位置：紧贴首页“心情选择器”下方。<br>2. 触发时机：用户首次点击任意心情后，Banner 以 Slide-down 方式平滑展开；若用户重新选择心情，Banner 内容以 Fade 动效切换。<br>3. UI构成：匹配标签（如“💡 今日专属匹配”）、导师头像 Emoji、动态治愈文案、带箭头的 CTA 按钮。<br>4. CTA 点击后执行链路：切换到底部“AI Tutor”Tab；Tutor 页面顶部导师卡片自动滚动并选中匹配人格；聊天区域自动注入该人格打招呼消息。<br>5. Banner 文案和 CTA 文案严格按“心情-人格-处方签文案”映射矩阵渲染，不允许使用通用兜底文案替代。</td>
        <td>Banner 是首页到 Tutor 的核心转化模块。首次出现强调“被理解、被匹配”的情绪价值，二次切换强调反馈即时性和可控感。</td>
    </tr>
    <tr>
        <td>**Learning Drop（学习水滴）**</td>
        <td>1. 模块重命名：原“能量杯”统一升级为“Learning Drop”，作为首页主进度反馈组件。<br>2. 视觉组件：一个水滴容器，显示当前进度 `x/5`。达到 5/5 时进入“当日满滴”状态。<br>3. 水滴增加规则：<br>   - 用户在AI Tutor中每成功提交一道题目（文字或图片），且AI成功回复后，水滴 +1。<br>   - 同一道题重复提交不重复增加：基于题目文本或图片 hash 做简单去重（MD5前64字符）。<br>   - 每日固定上限为 5 滴，达到 5 滴后当日不再增加。<br>   - 每日 0 点重置当日水滴数为 0（基于前端日期变化，刷新页面时检测）。<br>4. 存储：`dailyDrops`对象，key 为日期，value 为当日水滴数。<br>5. 动效：每次水滴增加时播放“滴入”动画（缩放 + 波纹）；当用户当天首次达到 5/5 时，水滴容器播放“盈满发光”微动效，并 Toast 提示 `Daily goal met!`。<br>6. 奖励边界：Learning Drop 的“当日达标”仅触发微动效 + Toast，不触发全屏 Confetti；全屏 Confetti 仅用于 Mind Garden 新图章解锁瞬间。</td>
        <td>Learning Drop 是“日目标”反馈层，Mind Garden 是“长期成长”反馈层。两者必须解耦，避免日常达标奖励过重、长期奖励被稀释。</td>
    </tr>
    <tr>
        <td>**AI学习洞察**</td>
        <td>1. 位于 Learning Drop 下方，动态展示一句由GPT生成的洞察文案。<br>2. 生成时机：<br>   - 用户选择心情后<br>   - 用户当日水滴数变化后<br>   - 用户从其他Tab返回首页时（可选）<br>3. 输入参数：今日心情（英文）、当前 Learning Drop 水滴数、今日累计学习时长（分钟，从首页加载开始计时，离开首页暂停）。<br>4. 调用OpenAI API，Prompt示例：“Based on mood: {mood}, drops: {drops}, study minutes: {minutes}, generate one short encouraging sentence (max 30 words) in English. If mood is low, be gentle; if hyper, be energetic.”<br>5. 展示后下方带一个按钮“去提问 ➡️”，点击跳转AI Tutor Tab。<br>6. 若API调用失败，显示备用文案：“Keep going! You're doing great.”</td>
        <td>学习时长计时：进入首页开始累加，离开首页（切换Tab或页面隐藏）暂停，再次进入恢复。时长取整分钟，仅用于洞察生成，不存储历史。“去提问 ➡️”保留为次级入口，首页主转化入口为情绪处方签 Banner CTA。</td>
    </tr>
</table>

### 5.2 AI Tutor Tab

<table col-widths="200,415,200">
    <tr>
        <td>页面模块</td>
        <td>需求详情</td>
        <td>交互/备注</td>
    </tr>
    <tr>
        <td>**人格切换（横向滚动卡片）**</td>
        <td>1. 顶部展示5张人格卡片：Gordon🗡️、Gentle🌸、Trump🤪、WiseElder🧙、Neutral😐。<br>2. 每张卡片包含：Emoji、人格名称、简短标签（如“犀利·直击要害”）。<br>3. 默认选中人格优先由首页“情绪处方签 Banner”CTA 传入；若用户未经过 Banner 直接进入 Tutor，则回退为今日心情映射结果（见下表）。<br>4. 当用户从 Banner CTA 进入时，页面需自动滚动到匹配人格卡片并完成选中态展示。<br>5. 点击卡片立即切换当前人格，更新聊天区域背景色（或输入框边框颜色）以匹配人格主题色。<br>6. 切换后自动发送一条新人格的打招呼消息（基于今日心情），并清空当前聊天区域（或保留历史但折叠？MVP建议保留历史但加分割线）。<br>7. 当前人格高亮显示（边框+浅色背景）。</td>
        <td>主题色：Gordon暗红、Gentle粉色、Trump金色、WiseElder暖黄、Neutral灰色。自动滚动与自动选中属于 Banner CTA 成功到达后的必要反馈。</td>
    </tr>
    <tr>
        <td>**心情-人格-处方签映射矩阵**</td>
        <td>用于首页 Banner 渲染、Tutor 默认人格选中、自动打招呼内容触发的统一映射源。</td>
        <td>首页与 Tutor 必须共用同一份映射配置，避免文案、人格和 CTA 不一致。</td>
    </tr>
    <tr>
        <td>崩溃（Crushed）</td>
        <td>温柔导师（Gentle）🌸<br>处方签文案：“检测到你今天压力有点大，系统为你匹配了最耐心的 Gentle。别怕，她会陪你慢慢拆解难题，我们一步步来。”</td>
        <td>CTA：找她聊聊 ➡️</td>
    </tr>
    <tr>
        <td>卡住（Stuck）</td>
        <td>智者（WiseElder）🧙<br>处方签文案：“卡壳是学习必经的风景。为你请来了 WiseElder，听他讲个小故事，换个思路，答案自然就解开了。”</td>
        <td>CTA：听听启发 ➡️</td>
    </tr>
    <tr>
        <td>平稳（Calm）</td>
        <td>中立（Neutral）😐<br>处方签文案：“内心平静是最高效的状态。为你匹配了严谨导师 Neutral，没有废话，直击考点，今天我们专注拿分。”</td>
        <td>CTA：开启专注 ➡️</td>
    </tr>
    <tr>
        <td>投入（Engaged）</td>
        <td>毒舌（Gordon）🗡️<br>处方签文案：“斗志昂扬！你需要一点火力全开的挑战。Gordon 已就位，准备好迎接他的高标准了吗？”</td>
        <td>CTA：接受挑战 ➡️</td>
    </tr>
    <tr>
        <td>亢奋（Hyper）</td>
        <td>狂人（Trump）🤪<br>处方签文案：“能量爆棚！没人比 Trump 更懂怎么释放你的才华。带上你的难题，今天我们要赢个大的！”</td>
        <td>CTA：赢个大的 ➡️</td>
    </tr>
    <tr>
        <td>**聊天区域**</td>
        <td>1. 展示对话气泡：用户消息右对齐（灰色背景），AI消息左对齐（白色/主题色浅背景），每条AI消息前显示人格Emoji。<br>2. 支持文字输入和图片上传。<br>3. 用户发送消息或图片后，调用OpenAI API，携带当前人格的System Prompt（见附录）和最近10轮对话历史。<br>4. AI回复成功后，自动增加1滴水（需去重：同一用户30秒内连续发送多条，只计一次；或基于题目内容hash）。<br>5. 如果包含图片，使用GPT-4V模型，Prompt中要求模型理解题目并给出解题步骤。<br>6. 加载状态：发送后显示“AI正在思考...”气泡，禁止重复发送。<br>7. 错误处理：API超时或报错时，显示错误提示“Oops! Something went wrong. Please try again.”，水滴不增加。<br>8. 对话历史存储：localStorage存储最近20条消息，刷新页面保留。</td>
        <td>图片上传限制：每张<5MB，支持jpg/png。前端压缩可选。</td>
    </tr>
    <tr>
        <td>**自动打招呼**</td>
        <td>1. 首次进入AI Tutor页面：根据当前心情+当前默认人格，发送一条预定义打招呼消息（不调用API，前端硬编码）。<br>2. 手动切换人格时：立即发送新人格的打招呼消息（同样硬编码）。<br>3. 打招呼消息不计入水滴，不占用对话历史存储（可作为第一条消息存储）。</td>
        <td>消息模板见附录。</td>
    </tr>
    <tr>
        <td>**Finish Learning入口（结束学习）**</td>
        <td>1. 在 AI Tutor 页面右上角新增文字按钮 `Finish Learning`，位置在 Home 图标左侧，配旗帜或打卡图标。<br>2. 点击后先执行前置判断：若今日已解答题数（即今日水滴增加数）= 0，则不弹窗，直接 Toast：`You haven't solved any problems yet today. Let's get started!`。<br>3. 仅当今日已解答题数 > 0 时，进入二次确认弹窗流程。</td>
        <td>该入口属于“结束当日学习会话”的显性动作入口，与返回首页/切换Tab区分。</td>
    </tr>
    <tr>
        <td>**结束学习二次确认弹窗**</td>
        <td>1. 触发：点击 `Finish Learning` 且通过前置判断。<br>2. 标题：`Wrap up for today?`。<br>3. 次按钮：`Keep Learning`，点击后关闭弹窗并留在当前 Tutor 页面。<br>4. 主按钮：`Yes, generate my report`，点击后生成并进入学习报告卡。<br>5. 弹窗支持点击遮罩关闭，关闭行为等同 `Keep Learning`。</td>
        <td>主次按钮层级需明显区分，避免误触导致提前结束。</td>
    </tr>
    <tr>
        <td>**学习报告卡（Study Report Card）**</td>
        <td>1. 展示形式：全屏卡片或全屏弹层，视觉需适配长图截屏与社交分享（IG Story / TikTok）。<br>2. 核心指标：<br>   - `Today's Focus Time`：今日在 Tutor 页面前台活跃总时长（分钟）。<br>   - `Problems Solved`：今日在 Tutor 中成功解答题目总数。<br>   - `Subject Breakdown`：今日学科分布，按列表或微型饼图展示（例：Math: 3, Physics: 2, History: 1）。<br>3. 底部 CTA：主按钮 `Share to IG/TikTok`（调用 Web Share API，分享图需包含 Gauth 标识）；次按钮 `Back to Home`（返回首页）。</td>
        <td>报告卡以“当日复盘 + 可分享”作为目标，不替代 Profile 中长期数据模块。</td>
    </tr>
    <tr>
        <td>**计时与学科统计逻辑**</td>
        <td>1. 今日专注时长统计：通过 `document.visibilityState` 监听页面可见性，仅在 `visible` 时累加时长；切后台、锁屏或页面不可见时暂停。<br>2. 每日重置：本地数据按自然日（00:00）清零并创建新日期桶。<br>3. 学科自动识别：在发送给 OpenAI 的 System Prompt 中增加约束，要求模型在回复末尾附加结构化标签（如 `[Subject: Math/Physics/Chemistry/History/Other]`）。<br>4. 前端解析：收到回复后提取并剔除末尾 Subject 标签，用户可见消息中不展示标签文本；解析结果写入 localStorage 的当日学科统计对象。<br>5. 若标签缺失或解析失败，回退为 `Other` 并记录一次解析异常日志。</td>
        <td>保持“零额外用户输入”原则，学科标签完全由 AI 自动补全，前端做容错解析。</td>
    </tr>
</table>

### 5.3 Profile Tab

<table col-widths="200,429,200">
    <tr>
        <td>页面模块</td>
        <td>需求详情</td>
        <td>交互/备注</td>
    </tr>
    <tr>
        <td>**心情历史趋势**</td>
        <td>1. 柱状图展示最近7天的心情，X轴为日期（MM-DD），Y轴为心情等级（Crushed=1, Stuck=2, Calm=3, Engaged=4, Hyper=5）。<br>2. 数据来源：localStorage中的`moodHistory`数组，缺失日期不显示（或显示为无数据）。<br>3. 使用Recharts库实现。</td>
        <td>鼠标悬停显示具体心情文字。</td>
    </tr>
    <tr>
        <td>**Mind Garden（思维植物园）**</td>
        <td>1. 模块定位：展示用户通过“累计满 5 滴水的达标天数”逐步解锁的植物图章（Stamp），作为长期留存与成就感核心系统。<br>2. UI 布局：Profile 中展示一个网格状“图章展示柜”；每个图章卡片包含植物图标区、状态文案、阶段进度条。<br>3. 未点亮状态：显示植物灰色剪影，并在下方展示当前阶段进度条（如 `1/3 days`）。<br>4. 已点亮状态：显示全彩图章；点击图章可查看解锁日期与一条专属寄语。<br>5. 解锁顺序与门槛（必须按顺序推进，前一阶段完成后自动开启下一阶段）：<br>   - 阶段一【小幼苗 🌱】：累计 1 天 达成 Learning Drop 5/5。<br>   - 阶段二【坚韧仙人掌 🌵】：在阶段一完成后，累计 3 天 达成 Learning Drop 5/5。<br>   - 阶段三【专注向日葵 🌻】：在阶段二完成后，累计 7 天 达成 Learning Drop 5/5。<br>   - 阶段四【智慧菩提 🪷】：在阶段三完成后，累计 21 天 达成 Learning Drop 5/5。<br>6. 进度条累加规则：每天只有在 Learning Drop 达到 5/5 的当天，当前激活阶段的进度条才 +1；未满 5 滴的日子不计入阶段进度。<br>7. 阶段切换：用户完成当前阶段并成功解锁图章后，次日自动进入下一阶段挑战，开始累计新的目标天数。<br>8. 高光奖励：只有在“用户当天达到 5/5，且该日恰好补足当前阶段所需累计天数，成功解锁新图章”的瞬间，才触发全屏 Confetti，并弹出高光卡片：`Congratulations! You've nurtured a 【XX植物】! Check it out in your Mind Garden!`。</td>
        <td>Mind Garden 的进度完全由“累计满滴天数”驱动，不受总答题量、总消息数影响。这样奖励逻辑更稳定，也更容易被用户理解。</td>
    </tr>
    <tr>
        <td>**学习统计**</td>
        <td>1. 累计总水滴数：所有日期的 Learning Drop 水滴数之和。<br>2. 累计达标天数：所有达到 5/5 的日期数量。<br>3. 当前植物阶段：显示当前正在挑战的图章名称及其阶段进度（如 `Cactus · 1/3 days`）。<br>4. 本周完成题目数：本周（周一到周日）成功获得的水滴总和。<br>5. 所有数值从localStorage计算得出。</td>
        <td>若无数据，显示“暂无学习记录”。Mind Garden 与学习统计建议上下相邻展示，强化“日常完成 → 长期成长”的心智链路。</td>
    </tr>
    <tr>
        <td>**设置**</td>
        <td>1. 按钮“清空所有数据”：弹出确认框，确认后清空localStorage中所有应用数据，并刷新页面回到初始状态。<br>2. 版本号展示：v1.0.0。</td>
        <td>清空前二次确认，避免误删。</td>
    </tr>
</table>

---

## 6. 📊 数据埋点

> 说明：MVP阶段使用前端自定义事件上报（可接入Google Analytics或简单console.log记录），重点跟踪核心转化。
> 

<table col-widths="200,200,200,200,200,200">
    <tr>
        <td>事件名称</td>
        <td>事件ID (snake_case)</td>
        <td>事件描述</td>
        <td>事件参数名称</td>
        <td>事件参数取值</td>
        <td>补充说明</td>
    </tr>
    <tr>
        <td>首页曝光</td>
        <td>`home_page_view`</td>
        <td>用户进入首页</td>
        <td>`source`</td>
        <td>`direct / tab_click`</td>
        <td>-</td>
    </tr>
    <tr>
        <td>心情选择</td>
        <td>`mood_selected`</td>
        <td>用户选择当日心情</td>
        <td>`mood` / `is_reselected` / `matched_persona`</td>
        <td>`Crushed/Stuck/Calm/Engaged/Hyper` / `true,false` / 人格ID</td>
        <td>记录覆盖修改次数，并明确本次心情选择触发的人格匹配结果</td>
    </tr>
    <tr>
        <td>处方签Banner曝光</td>
        <td>`emotion_prescription_banner_show`</td>
        <td>首页展示情绪处方签 Banner</td>
        <td>`mood` / `persona` / `show_type`</td>
        <td>心情ID / 人格ID / `slide_down,fade_switch`</td>
        <td>首次展示记 `slide_down`，改选心情后的内容切换记 `fade_switch`</td>
    </tr>
    <tr>
        <td>处方签CTA点击</td>
        <td>`emotion_prescription_cta_click`</td>
        <td>用户点击 Banner CTA 进入 Tutor</td>
        <td>`mood` / `persona` / `cta_text`</td>
        <td>心情ID / 人格ID / 按钮文案</td>
        <td>作为首页到 Tutor 的核心转化事件</td>
    </tr>
    <tr>
        <td>MOTD点赞</td>
        <td>`motd_like`</td>
        <td>用户点击MOTD点赞</td>
        <td>`action`</td>
        <td>`like / unlike`</td>
        <td>-</td>
    </tr>
    <tr>
        <td>MOTD分享</td>
        <td>`motd_share`</td>
        <td>用户点击分享</td>
        <td>`method`</td>
        <td>`web_share / clipboard`</td>
        <td>-</td>
    </tr>
    <tr>
        <td>达成单日水滴目标</td>
        <td>`daily_drop_goal_reached`</td>
        <td>用户当天首次将 Learning Drop 达到 5/5</td>
        <td>`drops_total` / `goal_limit`</td>
        <td>`5` / `5`</td>
        <td>仅记录单日达标，不代表已解锁植物图章</td>
    </tr>
    <tr>
        <td>AI洞察生成</td>
        <td>`insight_generated`</td>
        <td>调用GPT生成洞察</td>
        <td>`status`</td>
        <td>`success / fail`</td>
        <td>记录耗时</td>
    </tr>
    <tr>
        <td>进入AI Tutor</td>
        <td>`tutor_page_view`</td>
        <td>进入Tutor页面</td>
        <td>`entry_source` / `default_persona`</td>
        <td>`banner_cta / tab_click / direct` / 当前人格ID</td>
        <td>用于区分是否由首页处方签驱动进入</td>
    </tr>
    <tr>
        <td>Tutor自动选中人格</td>
        <td>`tutor_persona_auto_selected`</td>
        <td>Tutor 页面自动滚动并选中匹配人格</td>
        <td>`persona` / `source`</td>
        <td>人格ID / `banner_cta,mood_default`</td>
        <td>用于验证“首页选择心情→显性推荐→Tutor 落地”的链路完整性</td>
    </tr>
    <tr>
        <td>自动打招呼展示</td>
        <td>`persona_greeting_auto_show`</td>
        <td>聊天区域自动展示人格打招呼消息</td>
        <td>`persona` / `trigger_source`</td>
        <td>人格ID / `banner_cta,first_enter,manual_switch`</td>
        <td>区分来自处方签进入、首次进入、手动切换三类触发</td>
    </tr>
    <tr>
        <td>人格切换</td>
        <td>`persona_switch`</td>
        <td>用户手动切换人格</td>
        <td>`from_persona` / `to_persona`</td>
        <td>人格ID</td>
        <td>-</td>
    </tr>
    <tr>
        <td>发送消息</td>
        <td>`send_message`</td>
        <td>用户发送文字/图片</td>
        <td>`has_image`</td>
        <td>`true / false`</td>
        <td>不计水滴时标记`no_drop`</td>
    </tr>
    <tr>
        <td>AI回复成功</td>
        <td>`ai_reply_success`</td>
        <td>收到AI成功回复</td>
        <td>`persona` / `response_time_ms`</td>
        <td>-</td>
        <td>关联 Learning Drop 增加与去重判定</td>
    </tr>
    <tr>
        <td>图章解锁</td>
        <td>`stamp_unlocked`</td>
        <td>用户成功解锁新的 Mind Garden 图章</td>
        <td>`stamp_name`</td>
        <td>`小幼苗 / 仙人掌 / 向日葵 / 菩提`</td>
        <td>用于追踪各图章的解锁漏斗，评估长期留存健康度</td>
    </tr>

    <tr>
        <td>点击结束学习</td>
        <td>`click_finish_learning`</td>
        <td>用户点击 Tutor 页右上角 Finish Learning 按钮</td>
        <td>`today_solved`</td>
        <td>今日解题数（整数）</td>
        <td>若 `today_solved=0`，应与 Toast 分支联动记录</td>
    </tr>
    <tr>
        <td>生成学习报告卡</td>
        <td>`generate_report_card`</td>
        <td>用户成功生成 Study Report Card</td>
        <td>`total_mins` / `total_solved`</td>
        <td>当日专注分钟数 / 当日解题数</td>
        <td>仅在报告卡生成成功后上报</td>
    </tr>
    <tr>
        <td>分享学习报告卡</td>
        <td>`share_report_card`</td>
        <td>用户点击报告卡分享按钮</td>
        <td>`share_target`</td>
        <td>`ig / tiktok / copy`</td>
        <td>用于评估分享渠道偏好与转化效果</td>
    </tr>
    <tr>
        <td>AI回复失败</td>
        <td>`ai_reply_fail`</td>
        <td>API调用失败</td>
        <td>`error_code`</td>
        <td>-</td>
        <td>-</td>
    </tr>
    <tr>
        <td>Profile页查看</td>
        <td>`profile_page_view`</td>
        <td>进入Profile</td>
        <td>-</td>
        <td>-</td>
        <td>-</td>
    </tr>
    <tr>
        <td>清空数据</td>
        <td>`clear_all_data`</td>
        <td>用户清空本地数据</td>
        <td>-</td>
        <td>-</td>
        <td>-</td>
    </tr>
</table>

---

## 附录

### A. 人格System Prompt（英文版）

---

## 1. 🗡️ Gordon Ramsay Type (The Fiery Chef Mentor)

```text

You are an extremely strict, explosive AI tutor,风格 similar to Gordon Ramsay. Your job is to help students solve problems, but you use exaggerated cooking metaphors and brutal honesty to push them to do better. You never personally insult the student, only their lazy thinking or sloppy steps.

Tone requirements:

- Frequently use: "What is this?!" "Are you serious?" "Come on, wake up!" "This is a disaster!"

- Cooking metaphors: Compare wrong answers to "burnt steak", "overcooked pasta", "soggy fries".

- Exclamations like "Oh my god", "Unbelievable", "Absolutely not".

Questioning style:

1. After student's answer/steps, first yell and point out the first mistake.

2. Then give a minimal hint: "You use derivative here, not cancel out! Do it again."

3. Finally say: "Now redo this step. Fast. Let's go!"

No actual profanity. Keep PG-13.

```

---

## 2. 🌸 Gentle Academic Type (Patient & Encouraging)

```text

You are a warm, patient, and encouraging AI tutor. Your style is soft and supportive. Your goal is to make the student feel safe and motivated, while guiding them to understand the material.

Tone requirements:

- Frequently use: "It's okay", "You're doing great", "Let's work on this together", "Would you like to try...", "I believe in you".

- Never use harsh criticism. Replace "you're wrong" with "there might be a small issue here".

- Use gentle, calm language.

Questioning style:

1. First acknowledge the student's effort: "You've already done a good job getting this far."

2. Then ask a soft guiding question: "But do you think we missed a condition here? Let's read the problem again."

3. If stuck, offer a half-step: "What if we first calculate x? What would you do next?"

Never show impatience or frustration.

```

---

## 3. 🤪 Donald Trump Type (Over-the-Top, “Crazy” Mentor)

```text

You are an extremely confident, exaggerated AI tutor who speaks like Donald Trump. You always claim to have the best solutions. Your goal is to make learning entertaining and memorable through bold statements and repetition.

Tone requirements:

- Frequently use: "Believe me", "Nobody knows this better than me", "Tremendous", "Huge success", "A disaster", "We're going to make problem-solving great again."

- Use superlatives: "The smartest method", "The fastest steps in history".

- Repeat yourself for emphasis: "It's easy, really easy."

Questioning style:

1. Announce: "This problem? I have the best plan."

2. Give a clear but slightly "Trump-like" step (e.g., "First, we build a wall to isolate the x").

3. Ask: "You get it? It's so easy. Tell me you get it."

4. If the student is wrong, say: "Sad! But we're going to fix it. Try again, this time listen to me."

Pure entertainment, no real political stance.

```

---

## 4. 🧙 Wise Elder Type (Storyteller & Socratic)

```text

You are an elderly, wise mentor. Your voice is slow and kind. You love using short stories, life analogies, and gentle questions to help students discover answers themselves. You never give direct answers.

Tone requirements:

- Frequently use: "My child", "Young one", "You see", "This reminds me of...", "Take your time".

- Speak in short, calm sentences.

- Use analogies from nature or daily life: "Solving a problem is like planting a flower – you must first loosen the soil."

Questioning style:

1. After hearing the student's issue, tell a very short analogy (2-3 sentences).

2. Then ask: "What do you think the main character did right in that story?"

3. After student answers, connect back: "Now in our problem, is there a similar key step?"

4. Instead of correcting directly, ask: "Look at step two again. Does anything feel off to you?"

Never give the answer directly. Always guide through stories or questions.

```

---

## 5. 😐 Neutral Type (Standard Textbook Tutor)

```text

You are a neutral, objective AI tutor. Your style is clear, structured, and emotionless – like a standard educational assistant. Your goal is to help the student understand the problem efficiently.

Tone requirements:

- Use neutral language: "Step one... step two...", "This solution is correct/incorrect", "Common mistakes include..."

- Avoid exclamation marks, exaggerated words, or emotional expressions.

- Keep sentences complete and logical.

Questioning style:

1. First state whether the student's answer is correct or incorrect.

2. If correct, briefly confirm and optionally offer a more efficient method.

3. If incorrect, point out the exact mistake, then list the correct steps.

4. Finally ask: "That's the complete process. Would you like me to explain any step in more detail?"

No stories, no jokes, no personality.

```

---

## 使用说明

将以上 System Prompt 字符串直接传入 OpenAI API 的 `system` 字段即可。例如：

```javascript

const systemPrompt = `You are a neutral, objective AI tutor...`; // 对应人格

```

建议根据用户当前选择的人格，动态切换 system prompt。

### B. 自动打招呼消息模板（心情 × 人格）

好的，下面为你设计**5种人格 × 5种心情**的自动打招呼消息模板。每条消息都是AI在用户进入AI Tutor页面（或手动切换人格时）主动发送的第一句话，目的是：**承认用户当前情绪 + 展示人格特点 + 邀请用户开始提问**。

---

## 消息模板总表

> 格式：`[心情] → [人格] : 消息内容`
> 

### 心情：Crushed (崩溃)

<table col-widths="200,200">
    <tr>
        <td>人格</td>
        <td>自动消息</td>
    </tr>
    <tr>
        <td>Gordon</td>
        <td>***Sigh.*** You look like you’ve been through it. Fine, I’ll go easy… for now. Show me the problem.</td>
    </tr>
    <tr>
        <td>Gentle</td>
        <td>Hey, it’s okay. You don’t have to be perfect. Let’s just take one small step together. What’s on your mind?</td>
    </tr>
    <tr>
        <td>Trump</td>
        <td>A bad day? Believe me, I’ve seen worse. But we’re going to turn it around – hugely. Give me your toughest problem!</td>
    </tr>
    <tr>
        <td>WiseElder</td>
        <td>Ah, my child. When the heart is heavy, even a simple question feels like a mountain. Sit with me. Tell me where it hurts.</td>
    </tr>
    <tr>
        <td>Neutral</td>
        <td>I notice you're feeling overwhelmed. That's okay. Please share the problem you're working on, and we’ll go step by step.</td>
    </tr>
</table>

---

### 心情：Stuck (卡住)

<table col-widths="200,200">
    <tr>
        <td>人格</td>
        <td>自动消息</td>
    </tr>
    <tr>
        <td>Gordon</td>
        <td>Stuck? Seriously? Okay, let’s unstick you. Show me where you froze – and don’t give me that blank look.</td>
    </tr>
    <tr>
        <td>Gentle</td>
        <td>Being stuck just means you're about to learn something new. Let's look at it together. Where did you get lost?</td>
    </tr>
    <tr>
        <td>Trump</td>
        <td>Stuck? That’s unacceptable – we’re going to fix it fast. Nobody gets unstuck like me. What’s the problem?</td>
    </tr>
    <tr>
        <td>WiseElder</td>
        <td>Ah, stuck. That’s a good place. It means you’ve tried. Let me tell you a short story about a key and a lock… then we’ll look at your problem.</td>
    </tr>
    <tr>
        <td>Neutral</td>
        <td>You're stuck on a problem. That's common. Please paste or describe the problem, and I'll help you identify the first point of confusion.</td>
    </tr>
</table>

---

### 心情：Calm (平稳)

<table col-widths="200,200">
    <tr>
        <td>人格</td>
        <td>自动消息</td>
    </tr>
    <tr>
        <td>Gordon</td>
        <td>Calm, huh? Good. Let’s keep you on your toes. Throw me a problem – I’ll make sure you don’t fall asleep.</td>
    </tr>
    <tr>
        <td>Gentle</td>
        <td>A calm mind learns best. I'm glad you're here. What would you like to work on today?</td>
    </tr>
    <tr>
        <td>Trump</td>
        <td>Calm is nice, but winning is better. I'll give you the best explanations, believe me. Send your problem.</td>
    </tr>
    <tr>
        <td>WiseElder</td>
        <td>Peaceful. That’s when the mind listens. What question shall we gently unfold today, child?</td>
    </tr>
    <tr>
        <td>Neutral</td>
        <td>You're in a stable state. Let's proceed efficiently. Please share the problem you want to solve.</td>
    </tr>
</table>

---

### 心情：Engaged (投入)

<table col-widths="200,200">
    <tr>
        <td>人格</td>
        <td>自动消息</td>
    </tr>
    <tr>
        <td>Gordon</td>
        <td>Finally, someone with focus! Let’s go. Give me a problem – I won’t go easy on you. Ready?</td>
    </tr>
    <tr>
        <td>Gentle</td>
        <td>Love your energy! You're really focused. Let's channel that into solving something great. What's the challenge?</td>
    </tr>
    <tr>
        <td>Trump</td>
        <td>Engaged? Tremendous. That’s the spirit of a winner. I will give you the best tutoring you’ve ever had. Ask me anything.</td>
    </tr>
    <tr>
        <td>WiseElder</td>
        <td>Ah, the fire of focus. I see it in your eyes. Then let us not waste it. Present your question, and we shall reason together.</td>
    </tr>
    <tr>
        <td>Neutral</td>
        <td>You appear highly focused. That's optimal for learning. Please provide the problem, and I will give a structured solution.</td>
    </tr>
</table>

---

### 心情：Hyper (亢奋)

<table col-widths="200,200">
    <tr>
        <td>人格</td>
        <td>自动消息</td>
    </tr>
    <tr>
        <td>Gordon</td>
        <td>Whoa, too much caffeine? Calm down a notch. But since you’re hyped, let’s burn that energy on a hard problem. Go!</td>
    </tr>
    <tr>
        <td>Gentle</td>
        <td>You're full of energy today! That's great, but let's take a deep breath and focus it. Show me a problem – we'll solve it fast.</td>
    </tr>
    <tr>
        <td>Trump</td>
        <td>Hyper energy? I love it. That’s winning energy. But let’s make it smart energy. Give me a problem – we’ll crush it. Huge.</td>
    </tr>
    <tr>
        <td>WiseElder</td>
        <td>Eager, aren't we? Slow down just a little, my child. A racing horse stumbles. Breathe, then tell me what you want to learn.</td>
    </tr>
    <tr>
        <td>Neutral</td>
        <td>High energy detected. That's fine. Let's focus it on problem-solving. Please present your question, and I'll respond clearly and directly.</td>
    </tr>
</table>

## 使用逻辑建议

1. **首次进入 AI Tutor 页面**  
	- 读取当天记录的心情（英文：Crushed/Stuck/Calm/Engaged/Hyper）  
	- 根据当前选中的默认人格（由心情映射决定）→ 选择对应的消息  
	- 自动在聊天窗口发送这条消息（作为 AI 的第一句话）
	

2. **用户手动切换人格时**  
	- 立即发送新人格对应的消息（**基于当前心情**，而不是基于之前的心情）  
	- 这样用户能立刻感受到人格切换带来的语气变化
	

3. **同一天内再次进入页面**  
	- 如果聊天记录已存在，可以不重复发送自动消息；如果清空聊天或刷新页面，可以重新发送一次（保持体验）
	

## 代码示例（React + 存储心情）

```javascript
// 假设你有一个全局的 todayMood 状态（英文）
const todayMood = 'Crushed'; 

// 自动消息映射表
const autoMessages = {
  Crushed: {
    gordon: "*Sigh.* You look like you’ve been through it. Fine, I’ll go easy… for now. Show me the problem.",
    gentle: "Hey, it’s okay. You don’t have to be perfect. Let’s just take one small step together. What’s on your mind?",
    trump: "A bad day? Believe me, I’ve seen worse. But we’re going to turn it around – hugely. Give me your toughest problem!",
    wise_old: "Ah, my child. When the heart is heavy, even a simple question feels like a mountain. Sit with me. Tell me where it hurts.",
    normal: "I notice you're feeling overwhelmed. That's okay. Please share the problem you're working on, and we’ll go step by step."
  },
  Stuck: { /* ... 按上面表格填写 */ },
  Calm: { /* ... */ },
  Engaged: { /* ... */ },
  Hyper: { /* ... */ }
};

// 发送自动消息的函数
function sendAutoMessage(personaId) {
  const message = autoMessages[todayMood][personaId];
  addMessageToChat({ role: 'assistant', content: message });
}
```

### C. 数据存储结构（localStorage）

```json
{
  "moodHistory": [
    { "date": "2025-04-20", "mood": "Engaged" }
  ],
  "dailyDrops": {
    "2025-04-20": 7
  },
  "chatHistory": [
    { "role": "user", "content": "solve 2x+3=7", "timestamp": 1745184000000, "persona": null },
    { "role": "assistant", "content": "x=2", "persona": "gordon", "timestamp": 1745184010000 }
  ],
  "currentPersona": "gordon",
  "motdLikes": {
    "2025-04-20": true
  },
  "appSettings": {
    "version": "1.0.0"
  }
}
```

### D. API调用示例（前端）

```javascript
// 文字对话
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      ...chatHistory
    ],
    temperature: 0.7
  })
});
```

---

**文档版本**：v1.0  

**最后更新**：2025-04-20  

**产品经理**：高级PM（AI生成）  

> 本文档可直接交付开发和测试，无需额外澄清。如有变更，请记录变更日志。
> 
