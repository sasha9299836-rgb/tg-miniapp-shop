import { createShipmentForOrder, ShipmentProcessError } from "./cdekShipment.ts";

export type ConfirmOrderPaymentResult = {
  ok: boolean;
  existing: boolean;
  payment_already_confirmed: boolean;
  recorded_to_prodazhi: boolean;
  prodazhi_id: number | null;
  previous_status: string;
  current_status: string;
  post_id: string;
  nalichie_id: number | null;
  stock_deduction_status: "applied" | "existing";
  previous_post_sale_status: string | null;
  current_post_sale_status: string | null;
  previous_nalichie_status: string | null;
  current_nalichie_status: string | null;
};

export type FinalizeOrderShipmentResponse =
  | {
      ok: true;
      payment: ConfirmOrderPaymentResult;
      shipment: Awaited<ReturnType<typeof createShipmentForOrder>>;
    }
  | {
      ok: false;
      error: "SHIPMENT_CREATE_FAILED_AFTER_PAYMENT_CONFIRMED";
      message: string;
      payment: ConfirmOrderPaymentResult;
      shipment: {
        ok: false;
        status: "failed";
        error: string;
        details: unknown;
      };
    };

export function classifyConfirmPaymentError(message: string) {
  if (message === "ORDER_NOT_FOUND") {
    return { code: "ORDER_NOT_FOUND", status: 404 };
  }
  if (message.startsWith("PAYMENT_CONFIRM_NOT_ALLOWED:")) {
    return { code: "PAYMENT_CONFIRM_NOT_ALLOWED", status: 409 };
  }
  if (message.startsWith("ORDER_STATUS_NOT_CONFIRMABLE:")) {
    return { code: "ORDER_STATUS_NOT_CONFIRMABLE", status: 409 };
  }
  if (message.startsWith("STOCK_CONFLICT:")) {
    return { code: "STOCK_CONFLICT", status: 409 };
  }
  return null;
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) return maybeMessage.trim();
    const maybeDetails = (error as { details?: unknown }).details;
    if (typeof maybeDetails === "string" && maybeDetails.trim()) return maybeDetails.trim();
  }
  return "UNKNOWN_ERROR";
}

function mapShipmentFailureMessage(code: string) {
  if (code === "ORIGIN_PROFILE_REQUIRED") return "Не определен профиль отправки (ODN или YAN).";
  if (code === "PACKAGING_PRESET_REQUIRED") return "Не указана упаковка для отправления.";
  if (code === "PACKAGE_DIMENSIONS_REQUIRED") return "Не заполнены размеры или вес отправления.";
  if (code === "RECEIVER_CITY_CODE_REQUIRED") return "Не заполнен код города получателя для CDEK.";
  if (code === "DELIVERY_POINT_REQUIRED") return "Не заполнен пункт выдачи CDEK.";
  if (code === "RECIPIENT_REQUIRED") return "Не заполнены данные получателя.";
  if (code === "SALE_PRICE_REQUIRED") return "Не заполнена цена заказа для расчета отправления.";
  if (code === "CREDENTIALS_MISSING") return "Не настроены ключи CDEK для профиля отправки.";
  if (code === "TOKEN_REQUEST_FAILED" || code === "TOKEN_RESPONSE_INVALID") {
    return "Не удалось авторизоваться в CDEK. Проверьте ключи профиля отправки.";
  }
  if (code === "TARIFF_NOT_AVAILABLE") return "Для выбранных параметров не найден доступный тариф CDEK.";
  if (code === "EXTERNAL_ORDER_ID_REQUIRED") return "Не передан идентификатор заказа для отправления.";
  if (code === "INVALID_ORIGIN_PROFILE") return "Указан недопустимый профиль отправки.";
  if (code === "PACKAGE_REQUIRED") return "Не заполнены параметры упаковки.";
  if (code === "RAW_PAYLOAD_NOT_ALLOWED") return "Запрос содержит неподдерживаемые поля доставки.";
  if (code === "CDEK_REQUEST_FAILED") return "Служба доставки отклонила запрос на создание отправления.";
  if (code === "CDEK_PROXY_UNREACHABLE") return "Сервис доставки временно недоступен.";
  if (code === "SHIPMENT_CREATE_FAILED") return "CDEK отклонил создание отправления.";
  if (code === "SHIPMENT_SAVE_FAILED") return "Не удалось сохранить данные отправления в заказ.";
  if (code === "POST_LOOKUP_FAILED" || code === "ORDER_LOOKUP_FAILED") return "Не удалось подготовить данные заказа для отправления.";
  if (code === "SHIPMENT_LOCK_FAILED" || code === "SHIPMENT_LOCK_RELEASE_FAILED") return "Сбой блокировки оформления отправления.";
  return "Не удалось создать отправление CDEK.";
}

export async function finalizePaidOrder(
  supabase: any,
  cdekProxyBaseUrl: string,
  orderId: string,
): Promise<FinalizeOrderShipmentResponse> {
  console.log(JSON.stringify({ scope: "shipment", event: "finalize_order_start", orderId }));
  const { data, error } = await supabase.rpc("tg_admin_confirm_paid_and_record_sale", {
    p_order_id: orderId,
  });

  if (error) {
    const rpcMessage = extractErrorMessage(error);
    const classified = classifyConfirmPaymentError(rpcMessage);
    console.log(
      JSON.stringify({
        scope: "shipment",
        event: "payment_confirm_rejected",
        orderId,
        error: rpcMessage,
        code: classified?.code ?? "CONFIRM_PAYMENT_FAILED",
      }),
    );
    throw new Error(rpcMessage);
  }

  const payment = (Array.isArray(data) ? data[0] : data) as ConfirmOrderPaymentResult | null;
  if (!payment?.ok) {
    throw new Error("CONFIRM_PAYMENT_FAILED");
  }
  console.log(
    JSON.stringify({
      scope: "shipment",
      event: "payment_confirmed",
      orderId,
      previousStatus: payment.previous_status,
      currentStatus: payment.current_status,
      paymentAlreadyConfirmed: payment.payment_already_confirmed,
      paymentExisting: payment.existing,
      recordedToProdazhi: payment.recorded_to_prodazhi,
      prodazhiId: payment.prodazhi_id,
      postId: payment.post_id,
      nalichieId: payment.nalichie_id,
      stockDeductionStatus: payment.stock_deduction_status,
      previousPostSaleStatus: payment.previous_post_sale_status,
      currentPostSaleStatus: payment.current_post_sale_status,
      previousNalichieStatus: payment.previous_nalichie_status,
      currentNalichieStatus: payment.current_nalichie_status,
    }),
  );

  try {
    const shipment = await createShipmentForOrder(supabase, cdekProxyBaseUrl, orderId);
    console.log(
      JSON.stringify({
        scope: "shipment",
        event: "finalize_order_completed",
        orderId,
        paymentStatus: payment.current_status,
        shipmentStatus: shipment.status,
        cdekUuid: shipment.cdek_uuid,
      }),
    );
    return {
      ok: true,
      payment,
      shipment,
    };
  } catch (shipmentError) {
    if (shipmentError instanceof ShipmentProcessError) {
      if (
        shipmentError.code === "ORDER_NOT_PAID" ||
        shipmentError.code === "DELIVERY_TYPE_NOT_SUPPORTED"
      ) {
        return {
          ok: true,
          payment,
          shipment: {
            ok: true,
            status: "skipped",
            reason: shipmentError.code === "ORDER_NOT_PAID" ? "order_not_paid" : "delivery_type_not_supported",
            order_id: orderId,
            origin_profile: null,
            cdek_uuid: null,
            cdek_track_number: null,
            cdek_status: null,
            cdek_tariff_code: null,
          },
        };
      }

      console.log(
        JSON.stringify({
          scope: "shipment",
          event: "finalize_order_partial_failure",
          orderId,
          paymentStatus: payment.current_status,
          stockDeductionStatus: payment.stock_deduction_status,
          shipmentError: shipmentError.code,
          shipmentErrorDetailsPresent: shipmentError.details != null,
        }),
      );
      return {
        ok: false,
        error: "SHIPMENT_CREATE_FAILED_AFTER_PAYMENT_CONFIRMED",
        message: `Оплата подтверждена, но CDEK shipment не создан: ${mapShipmentFailureMessage(shipmentError.code)}`,
        payment,
        shipment: {
          ok: false,
          status: "failed",
          error: shipmentError.code,
          details: shipmentError.details ?? null,
        },
      };
    }

    const message = shipmentError instanceof Error ? shipmentError.message : "UNKNOWN_ERROR";
    console.log(
      JSON.stringify({
        scope: "shipment",
        event: "finalize_order_failed",
        orderId,
        paymentStatus: payment.current_status,
        stockDeductionStatus: payment.stock_deduction_status,
        error: message,
      }),
    );
    return {
      ok: false,
      error: "SHIPMENT_CREATE_FAILED_AFTER_PAYMENT_CONFIRMED",
      message: "Оплата подтверждена, но CDEK shipment не создан: непредвиденная серверная ошибка.",
      payment,
      shipment: {
        ok: false,
        status: "failed",
        error: "CDEK_PROXY_UNREACHABLE",
        details: { message },
      },
    };
  }
}
