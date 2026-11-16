# 中文 for Sellio's owner app: glossary

The owner app's Chinese (the `*.json` files here, one per group of screens) uses these words, so
a screen never says one thing in one place and another elsewhere. Claude drafts every phrase from
this list (Alvin, 16 Nov 2026: EN, 中文, MY, ID; no manual translation). It is Simplified Chinese,
as Singapore and Malaysia write it, and matches the buyers' store page (`src/lib/LanguageContext.jsx`)
where the two meet: 订单, 购物车, 结账, 下单, 外带, 自取, 喜欢, 聊天.

Who sees it (`src/lib/appText.js`): anyone who picks 中文 (switched on for everyone, every group,
16 Nov 2026: "there should be the EN, 中文, MY, ID for everyone"), and Xie Lao Ma's shop first
(`SHOP_FIRST`; Alvin: "You can change Xie lao ma ones first though"), always one tap from English.
A Chinese phone does not switch the app by itself.

Style: polite and plain. 您 for "you"; buttons are short verbs (保存, 继续). Full-width punctuation
(，。？！：（）“”); a space between Chinese and Latin words or numbers (Sellio 账号, 10 件商品). Sellio,
plan names (Starter, Growth, Pro, Professional), PayNow, DuitNow, QRIS, Stripe, Google, WhatsApp,
SKU, Logo and QR as a payment method name stay as they are.

| English | 中文 |
|---|---|
| order (a buyer's), Orders (the screen) | 订单 |
| new order | 新订单 |
| Counter (taking orders at the till) | 收银台 |
| Take Orders, take an order | 点单 |
| Kitchen, Kitchen Display | 厨房, 厨房显示屏 |
| chit (kitchen ticket) | 厨房单 |
| receipt | 收据 |
| bill (a table's running bill), settle | 账单, 结账 / 结清 |
| product, listing, item | 商品 (件) |
| dish (the Counter) | 菜品 |
| category | 分类 |
| menu | 菜单 |
| stock, low stock, out of stock, sold out | 库存, 库存不足, 缺货, 已售罄 |
| variant, options, add-ons | 规格, 选项, 附加项 |
| Dashboard | 概览 |
| Settings | 设置 |
| shop, store | 店铺 (the shop as buyers address it: 店家) |
| store page (what buyers see) | 店铺页面 |
| owner | 店主 |
| staff, team | 员工, 团队 |
| customer | 顾客 |
| buyer, seller | 买家, 卖家 |
| table, Table 3 (a new table's name), Table {name} | 桌位, 3号桌, 桌号 {name} |
| dine in, takeaway | 堂食, 外带 |
| collection (the buyer collects), self-collect | 自取 |
| delivery, delivery charge, free delivery | 送货, 运费, 免运费 |
| pre-order | 预购 |
| payment, pay, paid, unpaid | 付款, 付款, 已付款, 未付款 |
| take payment, payment QR | 收款, 收款二维码 |
| cash, card, e-wallet | 现金, 刷卡, 电子钱包 |
| QR code | 二维码 |
| tax, discount, service charge | 税费, 折扣, 服务费 |
| total, subtotal | 总计, 小计 |
| report(s), revenue | 报表, 营业额 |
| plan, subscription, free trial | 方案, 订阅, 免费试用 |
| business plans | 商业方案 |
| sign in, sign up, sign out | 登录, 注册, 退出登录 |
| account, staff login | 账号, 员工账号 |
| password, mobile number, email | 密码, 手机号码, 邮箱 |
| profile photo | 头像 |
| save, cancel, delete, edit, add | 保存, 取消, 删除, 编辑, 添加 |
| continue, next, back, done, close | 继续, 下一步, 返回, 完成, 关闭 |
| try again, loading | 重试, 加载中 |
| tap | 点按 |
| notifications, alerts | 通知, 提醒 |
| Explore, Me, Chats | 发现, 我, 聊天 |
| Sellio Explore | Sellio 发现 |
| Home seller(s), Merchant(s), Goods, Services, Food & drinks | 居家卖家, 商家, 商品, 服务, 餐饮 |
| My likes, My purchases, My listings | 我喜欢的, 我的购买, 我的商品 |
| like, liked, unlike | 喜欢, 已喜欢, 取消喜欢 |
| Fresh finds, Deal options | 新鲜好物, 交易方式 |
| Ongoing, Past (purchases) | 进行中, 历史 |
| Buying, Selling (the chat lists, the Settings tab) | 购买, 销售 |
| archive, archived | 归档, 已归档 |
| Online, Last seen …, Seen | 在线, …在线, 已读 |
| rating, rate, stars, comment, report | 评分, 评分, 星级, 评论, 举报 |
| star words: Terrible, Not good, Okay, Good, Great | 很差, 较差, 一般, 好, 很好 |
| order statuses: new, confirmed, preparing, ready, served, completed, cancelled | 新订单, 已确认, 准备中, 已备好, 已上菜, 已完成, 已取消 |
| out for delivery, delivered, ready for collection, collected | 送货中, 已送达, 可以自取了, 已自取 |
| Active, Inactive (a product; a plan's status) | 启用, 停用 |
| Singapore, Malaysia, Indonesia | 新加坡, 马来西亚, 印尼 |

- Dates and times read as Intl writes them for zh-SG (`src/lib/appDates.js`): 2026年11月14日,
  11月14日 周六, 上午6:30, 5 分钟前.
- Examples are Chinese in the Chinese text (陈大明, 林美玲, 美玲家庭烘焙, 海南鸡饭); dish and shop names
  that are data stay as written.
- Printed receipts, table bills and kitchen chits stay in the shop's language, which is English
  for a shop in Singapore or Malaysia: receipt printers print plain letters, and Chinese would
  need the printer's double-byte mode (`src/lib/printWords.js`). New-order alerts and the emails
  Supabase sends stay English too.
- The CSV template and exports keep English column names: an import matches its columns by them.
- Store pages quote their own words in English ("Store unavailable"), as the Indonesian does.
- Canned chat questions (今天可以自取吗？) go out in the buyer's language: they are sent as they read.
- Once the explore group is live in 中文, the store page's own Chinese should say 我 › 我喜欢的 where
  it now says "Me › My likes".
