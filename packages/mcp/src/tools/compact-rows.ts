/**
 * Compact list rows: the fields an agent needs to answer worklist questions,
 * without the full attribute set the SDK maps (about 500 tokens a container).
 */

type Hold = { name?: string; status?: string; description?: string };
type Fee = {
  type?: string;
  amount?: number | string;
  currency_code?: string;
  currency?: string;
};

const present = <T>(value: T | null | undefined): value is T =>
  value !== null && value !== undefined && value !== '';

function withoutEmpty<T extends Record<string, unknown>>(row: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(row).filter(
      ([, value]) =>
        present(value) && !(Array.isArray(value) && value.length === 0),
    ),
  ) as Partial<T>;
}

// Holds and fees stay as [] when the terminal reported none, and are omitted
// when it reported nothing, so "no holds" never looks like "unknown".
export function compactContainer(container: any) {
  const holds: Hold[] | null | undefined = container?.demurrage?.holds;
  const fees: Fee[] | null | undefined = container?.demurrage?.fees;
  const shipment = container?.shipment;
  const row = withoutEmpty({
    id: container?.id,
    number: container?.number,
    status: container?.currentStatus ?? container?.status,
    availability_known: container?.availabilityKnown,
    available_for_pickup: container?.location?.availableForPickup,
    pod_terminal: container?.terminals?.podTerminal?.name,
    pod_arrived_at: container?.location?.podArrivedAt,
    pod_discharged_at: container?.location?.podDischargedAt,
    pod_full_out_at: container?.podFullOutAt,
    pickup_lfd: container?.demurrage?.pickupLfd,
    pickup_appointment_at: container?.demurrage?.pickupAppointmentAt,
    shipment: shipment
      ? withoutEmpty({
          bill_of_lading: shipment.billOfLading,
          shipping_line_scac: shipment.shippingLineScac,
          port_of_discharge: shipment.portOfDischargeName,
          pod_vessel: shipment.podVesselName,
          pod_eta_at: shipment.podEtaAt,
          pod_ata_at: shipment.podAtaAt,
        })
      : undefined,
    last_status_refresh_at: container?.lastStatusRefreshAt,
  });
  return {
    ...row,
    ...(Array.isArray(holds)
      ? {
          holds: holds
            .filter((hold) => hold?.status === 'hold')
            .map((hold) => hold.name ?? hold.description ?? 'hold'),
        }
      : {}),
    ...(Array.isArray(fees)
      ? {
          fees: fees.map((fee) =>
            withoutEmpty({
              type: fee?.type,
              amount: fee?.amount,
              currency: fee?.currency_code ?? fee?.currency,
            }),
          ),
        }
      : {}),
  };
}
