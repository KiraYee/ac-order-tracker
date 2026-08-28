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

- 新建工单：记录商场、故障描述、联系人等基础信息
- 登记上门：每次师傅上门后，在工单详情里点"登记本次上门"，记录处理结果
  - 选"已修复"会自动把工单标记为已完成
  - 选其他结果（需配件 / 需官方售后 / 需换师傅 / 其他）会保持"维修中"，方便继续跟进
- 工单状态也可以在详情页手动调整

## 五、关于中国大陆访问

Vercel 和 Supabase 目前都没有大陆节点，访问速度和稳定性可能受网络环境影响。如果团队里大陆同事反馈经常连不上或很卡，可以考虑：
- 给 Vercel 域名做 CNAME 加速解析
- 或迁移到腾讯云开发 / 阿里云等国内服务（数据库表结构基本可以照搬，代码改动量不大）
