import type { Persona } from "@sbank/shared";
import { HttpError } from "../../lib/errors.js";
import { PERSONA_DEFS } from "./customers.personas.js";
import { customersRepository } from "./customers.repository.js";

export const customersService = {
  async getStats(customerId: string) {
    const row = await customersRepository.findWithStats(customerId);
    if (!row) throw new HttpError(404, `Customer ${customerId} not found`);
    return row;
  },

  async getPersonas(): Promise<Persona[]> {
    const ages = await customersRepository.findAges(PERSONA_DEFS.map((p) => p.customerId));
    const ageOf = new Map(ages.map((a) => [a.customerId, a.age ?? 0]));
    return PERSONA_DEFS.map((p) => ({
      customerId: p.customerId,
      name: p.name,
      age: ageOf.get(p.customerId) ?? 0,
      description: p.description,
    }));
  },
};
