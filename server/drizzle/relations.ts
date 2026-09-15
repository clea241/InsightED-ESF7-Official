import { relations } from "drizzle-orm/relations";
import { esf7PersonnelProfile, esf7PersonnelEmployment, esf7PerssonelEduc, esf7RegularSections, esf7PersonnelLdTrainings, esf7RemedialEnrichmentSections, esf7PersonnelLearningAreas, esf7PersonnelDesignations, esf7ShsWorkloadRows, esf7AralSections, esf7WorkloadRows, esf7WorkloadTransfer, overloadAbsences, overloadLate, overloadPayAndReason, esf7Requests, esf7WorkImmersion } from "./schema";

export const esf7PersonnelEmploymentRelations = relations(esf7PersonnelEmployment, ({one}) => ({
	esf7PersonnelProfile: one(esf7PersonnelProfile, {
		fields: [esf7PersonnelEmployment.personnelId],
		references: [esf7PersonnelProfile.id]
	}),
}));

export const esf7PersonnelProfileRelations = relations(esf7PersonnelProfile, ({many}) => ({
	esf7PersonnelEmployments: many(esf7PersonnelEmployment),
	esf7PerssonelEducs: many(esf7PerssonelEduc),
	esf7RegularSections: many(esf7RegularSections),
	esf7PersonnelLdTrainings: many(esf7PersonnelLdTrainings),
	esf7RemedialEnrichmentSections: many(esf7RemedialEnrichmentSections),
	esf7PersonnelLearningAreas: many(esf7PersonnelLearningAreas),
	esf7PersonnelDesignations: many(esf7PersonnelDesignations),
	esf7ShsWorkloadRows: many(esf7ShsWorkloadRows),
	esf7AralSections: many(esf7AralSections),
	esf7WorkloadRows: many(esf7WorkloadRows),
	esf7WorkloadTransfers_absentPersonnelId: many(esf7WorkloadTransfer, {
		relationName: "esf7WorkloadTransfer_absentPersonnelId_esf7PersonnelProfile_id"
	}),
	esf7WorkloadTransfers_relievingPersonnelId: many(esf7WorkloadTransfer, {
		relationName: "esf7WorkloadTransfer_relievingPersonnelId_esf7PersonnelProfile_id"
	}),
	overloadAbsences: many(overloadAbsences),
	overloadLates: many(overloadLate),
	overloadPayAndReasons: many(overloadPayAndReason),
	esf7Requests: many(esf7Requests),
	esf7WorkImmersions: many(esf7WorkImmersion),
}));

export const esf7PerssonelEducRelations = relations(esf7PerssonelEduc, ({one}) => ({
	esf7PersonnelProfile: one(esf7PersonnelProfile, {
		fields: [esf7PerssonelEduc.personnelId],
		references: [esf7PersonnelProfile.id]
	}),
}));

export const esf7RegularSectionsRelations = relations(esf7RegularSections, ({one}) => ({
	esf7PersonnelProfile: one(esf7PersonnelProfile, {
		fields: [esf7RegularSections.adviserId],
		references: [esf7PersonnelProfile.id]
	}),
}));

export const esf7PersonnelLdTrainingsRelations = relations(esf7PersonnelLdTrainings, ({one}) => ({
	esf7PersonnelProfile: one(esf7PersonnelProfile, {
		fields: [esf7PersonnelLdTrainings.personnelId],
		references: [esf7PersonnelProfile.id]
	}),
}));

export const esf7RemedialEnrichmentSectionsRelations = relations(esf7RemedialEnrichmentSections, ({one}) => ({
	esf7PersonnelProfile: one(esf7PersonnelProfile, {
		fields: [esf7RemedialEnrichmentSections.assignedTeacherId],
		references: [esf7PersonnelProfile.id]
	}),
}));

export const esf7PersonnelLearningAreasRelations = relations(esf7PersonnelLearningAreas, ({one}) => ({
	esf7PersonnelProfile: one(esf7PersonnelProfile, {
		fields: [esf7PersonnelLearningAreas.personnelId],
		references: [esf7PersonnelProfile.id]
	}),
}));

export const esf7PersonnelDesignationsRelations = relations(esf7PersonnelDesignations, ({one}) => ({
	esf7PersonnelProfile: one(esf7PersonnelProfile, {
		fields: [esf7PersonnelDesignations.personnelId],
		references: [esf7PersonnelProfile.id]
	}),
}));

export const esf7ShsWorkloadRowsRelations = relations(esf7ShsWorkloadRows, ({one}) => ({
	esf7PersonnelProfile: one(esf7PersonnelProfile, {
		fields: [esf7ShsWorkloadRows.personnelId],
		references: [esf7PersonnelProfile.id]
	}),
}));

export const esf7AralSectionsRelations = relations(esf7AralSections, ({one}) => ({
	esf7PersonnelProfile: one(esf7PersonnelProfile, {
		fields: [esf7AralSections.tutorId],
		references: [esf7PersonnelProfile.id]
	}),
}));

export const esf7WorkloadRowsRelations = relations(esf7WorkloadRows, ({one}) => ({
	esf7PersonnelProfile: one(esf7PersonnelProfile, {
		fields: [esf7WorkloadRows.personnelId],
		references: [esf7PersonnelProfile.id]
	}),
}));

export const esf7WorkloadTransferRelations = relations(esf7WorkloadTransfer, ({one}) => ({
	esf7PersonnelProfile_absentPersonnelId: one(esf7PersonnelProfile, {
		fields: [esf7WorkloadTransfer.absentPersonnelId],
		references: [esf7PersonnelProfile.id],
		relationName: "esf7WorkloadTransfer_absentPersonnelId_esf7PersonnelProfile_id"
	}),
	esf7PersonnelProfile_relievingPersonnelId: one(esf7PersonnelProfile, {
		fields: [esf7WorkloadTransfer.relievingPersonnelId],
		references: [esf7PersonnelProfile.id],
		relationName: "esf7WorkloadTransfer_relievingPersonnelId_esf7PersonnelProfile_id"
	}),
	overloadAbsence: one(overloadAbsences, {
		fields: [esf7WorkloadTransfer.absenceId],
		references: [overloadAbsences.id]
	}),
}));

export const overloadAbsencesRelations = relations(overloadAbsences, ({one, many}) => ({
	esf7WorkloadTransfers: many(esf7WorkloadTransfer),
	esf7PersonnelProfile: one(esf7PersonnelProfile, {
		fields: [overloadAbsences.personnelId],
		references: [esf7PersonnelProfile.id]
	}),
}));

export const overloadLateRelations = relations(overloadLate, ({one}) => ({
	esf7PersonnelProfile: one(esf7PersonnelProfile, {
		fields: [overloadLate.personnelId],
		references: [esf7PersonnelProfile.id]
	}),
}));

export const overloadPayAndReasonRelations = relations(overloadPayAndReason, ({one}) => ({
	esf7PersonnelProfile: one(esf7PersonnelProfile, {
		fields: [overloadPayAndReason.personnelId],
		references: [esf7PersonnelProfile.id]
	}),
}));

export const esf7RequestsRelations = relations(esf7Requests, ({one}) => ({
	esf7PersonnelProfile: one(esf7PersonnelProfile, {
		fields: [esf7Requests.personnelId],
		references: [esf7PersonnelProfile.id]
	}),
}));

export const esf7WorkImmersionRelations = relations(esf7WorkImmersion, ({one}) => ({
	esf7PersonnelProfile: one(esf7PersonnelProfile, {
		fields: [esf7WorkImmersion.personnelId],
		references: [esf7PersonnelProfile.id]
	}),
}));