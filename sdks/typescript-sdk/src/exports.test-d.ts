import type {
  ContainerAddPartyRoleParams,
  ContainerUpdateAttributes,
  CustomFieldValue,
  PartyAttributes,
  ShipmentAddPartyRoleParams,
} from './index.js';

export const containerRole: ContainerAddPartyRoleParams = {
  role: 'pickup_dray_carrier',
  partyId: 'party-1',
};
export const shipmentRole: ShipmentAddPartyRoleParams = {
  role: 'customer',
  partyId: 'party-1',
};
export const containerAttributes: ContainerUpdateAttributes = {
  ref_numbers: ['PO-1'],
};
export const customFieldValue: CustomFieldValue = ['a', 'b'];
export const partyAttributes: PartyAttributes = { company_name: 'Acme' };
