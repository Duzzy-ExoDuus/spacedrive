import { getIcon, iconNames } from '@sd/assets/util';
import { useMemo } from 'react';
import { ObjectSearchOrdering, useLibraryQuery } from '@sd/client';
import { LocationIdParamsSchema } from '~/app/route-schemas';
import { useZodRouteParams } from '~/hooks';
import Explorer from '../Explorer';
import { ExplorerContextProvider } from '../Explorer/Context';
import { DefaultTopBarOptions } from '../Explorer/TopBarOptions';
import { EmptyNotice } from '../Explorer/View';
import { createDefaultExplorerSettings, objectOrderingKeysSchema } from '../Explorer/store';
import { useExplorer, useExplorerSettings } from '../Explorer/useExplorer';
import { TopBarPortal } from '../TopBar/Portal';

export const Component = () => {
	const { id: tagId } = useZodRouteParams(LocationIdParamsSchema);

	const explorerData = useLibraryQuery([
		'search.objects',
		{
			filter: {
				tags: [tagId]
			}
		}
	]);

	const tag = useLibraryQuery(['tags.get', tagId], { suspense: true });

	const explorerSettings = useExplorerSettings({
		settings: useMemo(
			() =>
				createDefaultExplorerSettings<ObjectSearchOrdering>({
					order: null
				}),
			[]
		),
		onSettingsChanged: () => {},
		orderingKeys: objectOrderingKeysSchema
	});

	const explorer = useExplorer({
		items: explorerData.data?.items || null,
		parent: tag.data
			? {
					type: 'Tag',
					tag: tag.data
			  }
			: undefined,
		settings: explorerSettings
	});

	return (
		<ExplorerContextProvider explorer={explorer}>
			<TopBarPortal right={<DefaultTopBarOptions />} />
			<Explorer
				emptyNotice={
					<EmptyNotice
						icon={<img className="h-32 w-32" src={getIcon(iconNames.Tags)} />}
						message="No items assigned to this tag."
					/>
				}
			/>
		</ExplorerContextProvider>
	);
};
