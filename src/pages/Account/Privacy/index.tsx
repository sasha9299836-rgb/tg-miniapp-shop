import { useNavigate } from "react-router-dom";
import { Button } from "../../../shared/ui/Button";
import { Card, CardTitle } from "../../../shared/ui/Card";
import { Page } from "../../../shared/ui/Page";
import "../legal.css";

const sections: Array<{ title: string; text: string[] }> = [
  {
    title: "1. Общие положения",
    text: [
      "Настоящая Политика конфиденциальности определяет порядок обработки персональных данных пользователей Telegram Mini App AES ISLAND https://t.me/aesisland_bot.",
      "Использование Сервиса означает согласие Пользователя с настоящей Политикой.",
    ],
  },
  {
    title: "2. Оператор",
    text: ["Оператором персональных данных является самозанятый гражданин.", "Контакты для связи: Telegram: @aesadmin1, @aesadminmsk."],
  },
  {
    title: "3. Какие данные собираются",
    text: [
      "Оператор может обрабатывать следующие персональные данные: ФИО, номер телефона, Telegram ID, адрес доставки, город, пункт выдачи СДЭК.",
    ],
  },
  {
    title: "4. Источники данных",
    text: [
      "Данные могут поступать напрямую от Пользователя при оформлении заказа и из Telegram Mini App, в том числе Telegram ID.",
    ],
  },
  {
    title: "5. Цели обработки данных",
    text: [
      "Персональные данные используются исключительно для оформления и обработки заказов, связи с Пользователем, доставки товаров и передачи данных в службу доставки.",
    ],
  },
  {
    title: "6. Передача данных третьим лицам",
    text: [
      "Персональные данные могут передаваться третьим лицам только в следующих случаях: в службу доставки СДЭК - для выполнения доставки, а также в случаях, предусмотренных законодательством РФ.",
    ],
  },
  {
    title: "7. Хранение и защита данных",
    text: [
      "Персональные данные хранятся с использованием облачных сервисов и технических средств.",
      "Оператор принимает разумные меры для защиты данных от несанкционированного доступа, изменения или удаления.",
    ],
  },
  {
    title: "8. Срок хранения данных",
    text: [
      "Персональные данные хранятся в течение срока, необходимого для выполнения целей обработки, либо до момента удаления по запросу Пользователя.",
    ],
  },
  {
    title: "9. Права пользователя",
    text: [
      "Пользователь имеет право запросить информацию о своих данных, потребовать их изменение или удаление, отозвать согласие на обработку.",
      "Для этого необходимо обратиться в Telegram: @aesadmin1 или @aesadminmsk.",
    ],
  },
  {
    title: "10. Изменения политики",
    text: ["Оператор имеет право вносить изменения в настоящую Политику. Актуальная версия всегда доступна в Сервисе."],
  },
];

export function PrivacyPage() {
  const nav = useNavigate();

  return (
    <Page title="Политика конфиденциальности">
      <div className="legal-doc">
        <Card className="ui-card--padded legal-doc__card">
          <CardTitle>Политика конфиденциальности</CardTitle>
          <div className="legal-doc__effective">Дата вступления в силу: 09.04.2026</div>
          {sections.map((section) => (
            <section key={section.title} className="legal-doc__section">
              <div className="legal-doc__section-title">{section.title}</div>
              {section.text.map((paragraph) => (
                <p key={paragraph} className="legal-doc__text">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </Card>

        <Button variant="secondary" className="legal-doc__back" onClick={() => nav(-1)}>
          Назад
        </Button>
      </div>
    </Page>
  );
}

export default PrivacyPage;

