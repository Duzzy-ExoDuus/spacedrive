import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext } from 'react';
import { useNavigate } from 'react-router';
import {
	currentLibraryCache,
	getOnboardingStore,
	resetOnboardingStore,
	telemetryStore,
	useBridgeMutation,
	useCachedLibraries,
	useOnboardingStore,
	usePlausibleEvent
} from '@sd/client';
import { RadioGroupField, useZodForm, z } from '@sd/ui';

export const OnboardingContext = createContext<ReturnType<typeof useContextValue> | null>(null);

// Hook for generating the value to put into `OnboardingContext.Provider`,
// having it separate removes the need for a dedicated context type.
export const useContextValue = () => {
	const libraries = useCachedLibraries();
	const library =
		libraries.data?.find((l) => l.uuid === currentLibraryCache.id) || libraries.data?.[0];

	const form = useFormState();

	return {
		...form,
		libraries,
		library
	};
};

export const shareTelemetry = RadioGroupField.options([
	z.literal('share-telemetry'),
	z.literal('minimal-telemetry')
]).details({
	'share-telemetry': {
		heading: 'Share anonymous usage',
		description:
			'Share completely anonymous telemetry data to help the developers improve the app'
	},
	'minimal-telemetry': {
		heading: 'Share the bare minimum',
		description: 'Only share that I am an active user of Spacedrive and a few technical bits'
	}
});

const schema = z.object({
	name: z.string().min(1, 'Name is required').regex(/[\S]/g).trim(),
	shareTelemetry: shareTelemetry.schema
});

// this is a lot so it gets its own hook :)
const useFormState = () => {
	const obStore = useOnboardingStore();

	const form = useZodForm({
		schema,
		defaultValues: {
			name: obStore.newLibraryName,
			shareTelemetry: 'share-telemetry'
		}
	});

	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const submitPlausibleEvent = usePlausibleEvent();

	const createLibrary = useBridgeMutation('library.create');

	const onSubmit = form.handleSubmit(async (data) => {
		navigate('./creating-library', { replace: true });

		// opted to place this here as users could change their mind before library creation/onboarding finalization
		// it feels more fitting to configure it here (once)
		telemetryStore.shareFullTelemetry = getOnboardingStore().shareFullTelemetry;

		try {
			// show creation screen for a bit for smoothness
			const [library] = await Promise.all([
				createLibrary.mutateAsync({
					name: data.name
				}),
				new Promise((res) => setTimeout(res, 500))
			]);

			queryClient.setQueryData(['library.list'], (libraries: any) => [
				...(libraries ?? []),
				library
			]);

			if (telemetryStore.shareFullTelemetry) {
				submitPlausibleEvent({ event: { type: 'libraryCreate' } });
			}

			resetOnboardingStore();
			navigate(`/${library.uuid}/overview`, { replace: true });
		} catch (e) {
			if (e instanceof Error) {
				alert(`Failed to create library. Error: ${e.message}`);
			}
			navigate('./privacy');
		}
	});

	return { form, onSubmit };
};

export const useOnboardingContext = () => {
	const ctx = useContext(OnboardingContext);

	if (!ctx)
		throw new Error('useOnboardingContext must be used within OnboardingContext.Provider');

	return ctx;
};
