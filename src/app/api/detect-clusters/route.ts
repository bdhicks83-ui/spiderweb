select
  c.insight_a_id,
  c.insight_b_id,
  c.similarity,
  ia.source_id as source_a,
  ib.source_id as source_b,
  ia.user_id as user_a,
  ib.user_id as user_b
from connections c
join insights ia on ia.id = c.insight_a_id
join insights ib on ib.id = c.insight_b_id
where ia.id in (
  '2e4fecbc-7f7d-4c8a-95b0-9853d8e6dee4',
  '05121358-309c-4378-9a65-fc4abc74134c',
  '88b51788-776f-4774-acd2-eeac10ed8631'
)
or ib.id in (
  '2e4fecbc-7f7d-4c8a-95b0-9853d8e6dee4',
  '05121358-309c-4378-9a65-fc4abc74134c',
  '88b51788-776f-4774-acd2-eeac10ed8631'
);