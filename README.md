# 空调维保工单台账

追踪空调维修维保工单：报修 → 核实 → 派工 → 上门 → 结案，支持一个工单多次上门记录。

## 一、准备工作（已经做过可跳过）

1. 在 [supabase.com](https://supabase.com) 注册账号并新建一个 Project
2. 进入 `SQL Editor`，执行以下建表脚本：

```sql
create table orders (
  id uuid primary key default gen_random_uuid(),
  ticket_no text not null,
  mall text not null,
  brand text,
  contact_name text,
  contact_phone text,
  issue_desc text not null,
  report_time timestamptz not null,
  status text not null default '待核实',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table visits (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  visit_time timestamptz not null,
  master text not null,
  master_phone text,
  result_type text not null,
  note text,
  created_by text,
  created_at timestamptz not null default now()
);

-- 如果表已经建好了，后续新增了「地址」「备注」字段，执行下面两行即可（重复执行不会报错）：
-- alter table orders add column if not exists address text;
-- alter table orders add column if not exists notes text;

alter table orders enable row level security;
alter table visits enable row level security;

create policy "team can access orders" on orders
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "team can access visits" on visits
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
```

3. 进入 `Authentication -> Users`，手动给团队每个人建一个账号（邮箱 + 密码）
4. 进入 `Project Settings -> API`，记下 `Project URL` 和 `anon public` key

## 二、本地跑起来（可选，用来先看效果）

```bash
npm install
cp .env.local.example .env.local
# 打开 .env.local，把上一步的 Project URL 和 anon key 填进去
npm run dev
```

打开 http://localhost:3000 ，用 Supabase 里建好的账号登录即可。

## 三、正式部署到 Vercel

1. 把这个项目传到一个 GitHub 仓库（新建仓库，`git init` / `git add .` / `git commit` / `git push`，或直接在 GitHub 网页上传）
2. 去 [vercel.com](https://vercel.com) 注册，选择 "Import Git Repository"，选中你刚才的仓库
3. 部署配置页面里找到 "Environment Variables"，添加两个变量：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   （值就是你在 Supabase 里记下的那两个）
4. 点击 Deploy，几分钟后会拿到一个 `xxx.vercel.app` 的网址
5. （可选）在 Vercel 项目设置里的 "Domains" 绑定你自己买的域名

## 四、日常使用

- 新建工单：分开填城市、商场、品牌方，可选甲方公司、跟单人、投保、关联历史工单
- 工单详情分四块：基本信息、投保、报价管理、验收管理（已完成后才出现）
- 登记上门：记录师傅和处理结果；选「已修复」会把工单标为已完成
- 工单状态也可以在详情页手动调整；到「待上门」之后会出现施工单办理

## 五、关于中国大陆访问

Vercel 和 Supabase 目前都没有大陆节点，访问速度和稳定性可能受网络环境影响。如果团队里大陆同事反馈经常连不上或很卡，可以考虑：
- 给 Vercel 域名做 CNAME 加速解析
- 或迁移到腾讯云开发 / 阿里云等国内服务（数据库表结构基本可以照搬，代码改动量不大）

## 六、多页面结构（总览 / 工单 / 师傅 / 财务）

这一版把原来的单页应用拆成了带侧边栏的四个页面。升级步骤：

1. 依次执行 `migration_v2.sql`、`migration_v3.sql`、`migration_v3b.sql`、`migration_v4.sql`（已经执行过的可以跳过，都是 `if not exists`）
2. 用最新的项目代码覆盖本地文件夹
3. `npm run dev` 跑起来，重点看：
   - **总览**（`/`）：进行中工单、按周/月/年统计
   - **工单**（`/orders`）：详情分区、统一报价、关联工单可事后改
   - **师傅**（`/technicians`）：按城市分组，资源能力标签
   - **财务**（`/finance`）：客户费用结算 / 师傅费用结算 / 垫付报销
4. 确认没问题后 push 到 GitHub，Vercel 自动重新部署

## 七、当前功能要点

- 城市 / 商场 / 品牌方三个字段分开登记
- 甲方公司、跟单人可在名单里选择或当场新增（默认甲方「孟董」）
- 投保：有/无；有则单选公众责任险或意外险，并填金额
- 报价：同一个项目同时填甲方单价和师傅单价，带数量（数量 × 单价）；保存后才进库，并记下最后修改时间和人；录入时会提示历史同类项目的两边价格
- 关联历史工单：新建时可选，事后也能在详情里补或改
- 施工单：状态到「待上门」及之后才出现
- 验收：状态变成「已完成」后填写验工单照片链接、清洗前后对比照片链接
- 师傅可打多个工种标签（空调工 / 电工，也可自定义）
- 上门记录可编辑和删除
- 垫付报销独立登记，可关联工单
