import { useNavigate, useParams } from "react-router-dom";
import { Button } from "../../shared/ui/Button";
import { Page } from "../../shared/ui/Page";
import "./styles.css";

export function InfoPage() {
  const { slug } = useParams();
  const nav = useNavigate();
  const isChannelRules = slug === "channel-rules";

  return (
    <Page title={isChannelRules ? "Правила магазина" : `Info: ${slug ?? ""}`}>
      {isChannelRules ? (
        <div className="info-page__rules">
          <p>Всем привет!</p>
          <p>Важная информация о магазине, перед покупками советуем ознакомиться⬇️</p>

          <section className="info-page__section">
            <h2>🛡 О нас:</h2>
            <p>
              Мы специализируемся на строго оригинальных вещах. В нашем ассортименте представлены культовые вещи известных направлений, в основе — Casual&apos;s, такие как Fred Perry и Weekend Offender, так и ведущие итальянские бренды — C.P. Company, Stone Island и многие другие.
            </p>
          </section>

          <section className="info-page__section">
            <h2>🛒 Процесс покупки:</h2>
            <p>
              Чтобы приобрести понравившуюся вещь, перешлите пост с ней любому из наших администраторов.
            </p>
            <p>
              По вашему запросу мы оперативно предоставим все необходимые дополнительные фотографии и замеры.
            </p>
            <p>После подтверждения всех деталей вы можете оплатить вещь.</p>
          </section>

          <section className="info-page__section">
            <h2>✉️ Доставка и самовывоз:</h2>
            <p>
              Самовывоз в Москве и Санкт-Петербурге: место и время согласовываются индивидуально с администратором. Возможна оплата на месте.
            </p>
            <p>
              По России: доставка осуществляется через ТК СДЭК. Если в вашем городе нет отделения СДЭК, мы отправим заказ другой транспортной компанией.
            </p>
            <p>Авито доставка: доступна с наценкой +11% к стоимости товара (не более 1 позиции).</p>
          </section>

          <section className="info-page__section">
            <h2>📌 Условия бронирования:</h2>
            <p>
              Вы можете забронировать любую вещь, внеся предоплату в размере 500 рублей. Эта сумма далее вычитается из полной стоимости товара.
            </p>
            <p>Бронь действует 10 дней и оформляется только один раз для одной позиции.</p>
            <p>
              Если в течение 10 дней брони полная оплата не произведена, бронь автоматически снимается, и право покупки переходит следующему желающему приобрести вещь.
            </p>
            <p>Возврат средств возможен только в течение 3 часов с момента её оплаты.</p>
          </section>

          <section className="info-page__section">
            <h2>🔐 Гарантии и возвраты:</h2>
            <p>Все продажи являются финальными. Возврат или обмен товара после покупки не предусмотрен.</p>
            <p>
              Более 800 наших реальных сделок и отзывов вы можете увидеть в нашем канале:{" "}
              <a href="https://t.me/aesreviews1" target="_blank" rel="noreferrer">
                AES REVIEWS
              </a>
            </p>
            <p>И помните, размеры указываются фактические!🤝</p>
            <p>
              НАШ ВТОРОЙ ПРОЕКТ:{" "}
              <a href="https://t.me/AESGLOBAL" target="_blank" rel="noreferrer">
                AES GLOBAL
              </a>
            </p>
            <p>Розничные и оптовые доставки товаров из других стран!</p>
          </section>

          <section className="info-page__section">
            <h2>🔈 Наши администраторы:</h2>
            <ul className="info-page__admins">
              <li>@aesadmin1</li>
              <li>@aesadminmsk</li>
              <li>@Yoshi_Hattori</li>
              <li>@aesglobaladm (второй проект)</li>
            </ul>
          </section>

          <div className="info-page__back">
            <Button variant="secondary" onClick={() => nav(-1)}>Назад</Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => nav(-1)}>Назад</Button>
      )}
    </Page>
  );
}

export default InfoPage;
