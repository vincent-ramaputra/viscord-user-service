export enum RelationshipType {
  None = 0,

  Pending = 1,
  Friends = 2,
  Blocked = 3,
  PendingReceived = 4,
}

export const RelationshipTypeString = {
  [RelationshipType.Pending]: 'Pending',
  [RelationshipType.Friends]: 'Friends',
  [RelationshipType.Blocked]: 'Blocked',
  [RelationshipType.PendingReceived]: 'PendingReceived',
};
