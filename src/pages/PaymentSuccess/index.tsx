import { useNavigate } from "react-router-dom";
import { Button } from "../../shared/ui/Button";
import { Card, CardText, CardTitle } from "../../shared/ui/Card";
import { Page } from "../../shared/ui/Page";
import { useCartStore } from "../../entities/cart/model/useCartStore";
import "./styles.css";

export function PaymentSuccessPage() {
  const nav = useNavigate();
  const cart = useCartStore();

  return (
    <Page>
      <div style={{ display: "grid", gap: 12 }}>
        <Card className="ui-card--padded payment-success__card">
          <div className="payment-success__content">
            <CardTitle className="payment-success__title">
              Ваш заказ принят и находится в обработке
            </CardTitle>
            <CardText>
              Спасибо за заказ! Ваш заказ уже передан в обработку. Мы отправим уведомление, когда он будет подтвержден. Статус заказа можно отслеживать в «Аккаунт — Заказы».
            </CardText>
          </div>
        </Card>

        <Button
          onClick={() => {
            cart.clear();
            nav("/account/orders");
          }}
        >
          Перейти к заказам
        </Button>

        <Button variant="secondary" onClick={() => nav("/")}
        >
          На главную
        </Button>
      </div>
    </Page>
  );
}

export default PaymentSuccessPage;
