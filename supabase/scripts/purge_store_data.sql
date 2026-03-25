begin;

-- Собираем связанные сущности до удаления, чтобы потом безопасно очистить
-- проданные позиции склада и записи продаж.
create temporary table purge_posts on commit drop as
select p.id, p.nalichie_id
from public.tg_posts p;

create temporary table purge_orders on commit drop as
select o.id
from public.tg_orders o;

create temporary table purge_sales on commit drop as
select s.id, s.prodazhi_id, s.nalichie_id
from public.tg_sales s;

create temporary table purge_nalichie on commit drop as
select distinct nalichie_id
from (
  select nalichie_id from purge_posts
  union all
  select nalichie_id from purge_sales
) src
where nalichie_id is not null;

create temporary table purge_prodazhi on commit drop as
select distinct prodazhi_id
from purge_sales
where prodazhi_id is not null;

-- История и служебные следы по заказам.
delete from public.tg_shipment_status_history
where order_id in (select id from purge_orders);

delete from public.tg_order_events
where order_id in (select id from purge_orders);

delete from public.tg_order_status_events
where order_id in (select id from purge_orders);

-- Журнал продаж из внешней таблицы.
delete from public.prodazhi
where id in (select prodazhi_id from purge_prodazhi)
   or nalichie_id in (select nalichie_id from purge_nalichie);

-- Продажи магазина и сами заказы.
delete from public.tg_sales
where id in (select id from purge_sales);

delete from public.tg_orders
where id in (select id from purge_orders);

-- Медиа и карточки каталога.
delete from public.tg_post_defect_photos
where post_id in (select id from purge_posts);

delete from public.tg_post_photos
where post_id in (select id from purge_posts);

delete from public.tg_posts
where id in (select id from purge_posts);

-- Привязанные складские остатки, только если они реально были связаны с магазином.
delete from public.nalichie
where id in (select nalichie_id from purge_nalichie);

commit;

-- Контрольные проверки после очистки.
select 'tg_posts' as table_name, count(*) as rows_count from public.tg_posts
union all
select 'tg_post_photos', count(*) from public.tg_post_photos
union all
select 'tg_post_defect_photos', count(*) from public.tg_post_defect_photos
union all
select 'tg_orders', count(*) from public.tg_orders
union all
select 'tg_order_events', count(*) from public.tg_order_events
union all
select 'tg_order_status_events', count(*) from public.tg_order_status_events
union all
select 'tg_shipment_status_history', count(*) from public.tg_shipment_status_history
union all
select 'tg_sales', count(*) from public.tg_sales;
