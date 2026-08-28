# Rogue Config Universe Inventory — Appendix

> Generated from the local 2026-08-27 TurnBasedGameData/ExcelOutput snapshot. PK / candidate is a structural uniqueness candidate, not a declared database constraint. Partial means only inventory-level semantics have been inspected.

Total: **235** Rogue-named JSON configs.

| Config | Count | PK / candidate | Important relations | Signals | Likely role | Evidence |
|---|---:|---|---|---|---|---|
| `ActivityRewardRogueEndless.json` | 20 | `RewardID` | `RewardID` | `RewardLevelName` | reward | Partial |
| `ActivityRogueAreaConfig.json` | 5 | `ActivityModuleID` | `ActivityModuleID`, `AreaEffectIDList`, `AreaID`, `BattleAreaGroupID`, `BattleAreaID` | `Describe`, `FigurePath`, `FigurePath2`, `MazeBuffIDList`, `MiracleEffectIDList` | mode area | Partial |
| `ActivityRogueAreaOverride.json` | 35 | `—` | `RogueAreaID` | — | mode area | Partial |
| `ActivityRogueGuideBanner.json` | 4 | `ActivityID` | `ActivityID` | `TypeParam` | mode support | Partial |
| `ConstValueRogue.json` | 85 | `—` | — | `ConstRogueName` | constants | Partial |
| `FinishWayRogue.json` | 213 | `ID` | `ID`, `ParamIntList`, `ParamItemList` | `FinishType`, `ParamType` | mode support | Partial |
| `GuideRogueData.json` | 6 | `ID` | `ID`, `RelatedID`, `TabID` | `IconPath`, `Name`, `TabIconPath` | mode support | Partial |
| `GuideRogueTab.json` | 3 | `GuideType` | `GuideType`, `ID` | `IconPath`, `Name` | mode support | Partial |
| `RogueActivityResidentConfig.json` | 5 | `ActivityID` | `ActivityID`, `ActivityModuleID`, `ActivityTagList`, `DisplayItemList`, `IntroGuideImg` | `ResidentDesc`, `ResidentName`, `TitleIconPath` | mode support | Partial |
| `RogueAdventureRoom.json` | 3 | `ParamGroupID` | `ParamGroupID`, `RoomID` | `AdventureType` | room graph | Partial |
| `RogueAeon.json` | 9 | `AeonID` | `AeonID`, `ArrivedTalkDialogueGroupID`, `BattleEventBuffGroup`, `BattleEventEnhanceBuffGroup`, `DisplayID` | `EffectDesc1`, `EffectDesc2`, `RogueBuffType` | path/aeon | Partial |
| `RogueAeonDisplay.json` | 14 | `DisplayID` | `DisplayID` | `AeonBuffIcon`, `AeonFigure`, `AeonIcon`, `AeonImage`, `RogueAeonName`, `RogueAeonPathName` | presentation | Partial |
| `RogueAeonLevelConfig.json` | 64 | `AeonStoryID+RogueAeonID` | `AeonStoryID`, `RogueAeonID`, `UnlockID` | `AeonStory_Name` | path/aeon | Partial |
| `RogueAeonListConfig.json` | 14 | `DisplayID` | `ActivityModuleID`, `DisplayID`, `RogueAeonID` | — | path/aeon | Partial |
| `RogueAeonStoryConfig.json` | 26 | `AeonStoryID+RogueAeonID` | `ActivityModuleID`, `AeonStoryID`, `RogueAeonID`, `UnlockID` | `AeonStory_Name` | path/aeon | Partial |
| `RogueArcade.json` | 10 | `ArcadeRoomID` | `ArcadeID`, `ArcadeRoomID`, `ParamGroupID` | `AdventureType` | mode support | Partial |
| `RogueArcadeType.json` | 7 | `ArcadeID` | `ArcadeID`, `PicPathList` | `BriefName`, `Desc`, `DetailedName`, `ExitDesc` | taxonomy | Partial |
| `RogueAreaConfig.json` | 38 | `AreaNameID` | `AreaNameID`, `ChestDisplayItemList`, `MapDisplayItemList`, `MonsterEliteDropDisplayID`, `RogueAreaID` | `AreaFigure`, `AreaIcon`, `AreaTipsIcon` | mode area | Partial |
| `RogueBonus.json` | 79 | `BonusID` | `BonusID` | `BonusDesc`, `BonusIcon`, `BonusTitle` | mode support | Partial |
| `RogueBuff.json` | 484 | `—` | `ActivityModuleID`, `AeonID`, `ExtraEffectIDList`, `MazeBuffID`, `RogueVersion` | `AeonCrossIcon`, `BattleEventBuffType`, `HandbookUnlockDesc`, `MazeBuffLevel`, `RogueBuffCategory`, `RogueBuffTag` | buff/blessing | Confirmed |
| `RogueBuffGroup.json` | 546 | `—` | — | — | pool/group | Partial |
| `RogueBuffHint.json` | 128 | `HintID` | `HintID` | `HintTextMap` | buff/blessing | Partial |
| `RogueBuffType.json` | 10 | `RogueBuffType` | `RogueBuffTypeTextmapID`, `RugueBuffTypeRewardQuestList` | `HintDesc`, `RogueBuffType`, `RogueBuffTypeIcon`, `RogueBuffTypeSubTitle`, `RogueBuffTypeTitle` | taxonomy | Partial |
| `RogueCandyCrash.json` | 2 | `ParamGroupID` | `ParamGroupID` | — | mode support | Partial |
| `RogueCaptureMonster.json` | 3 | `ParamGroupID` | `ParamGroupID` | — | mode support | Partial |
| `RogueCommonDialogue.json` | 7 | `DialogueID` | `DialogueID` | `DialoguePath` | mode support | Partial |
| `RogueCommonModeTitle.json` | 5 | `SubMode` | `SubMode`, `TitleTextmapID` | `TitleIconPath` | mode support | Partial |
| `RogueDLCAdventureRoom.json` | 8 | `RoomID` | `ParamGroupID`, `RoomID` | `AdventureType` | room graph | Partial |
| `RogueDLCAeon.json` | 8 | `AeonDiceID` | `AeonDiceID`, `AeonID`, `BattleEventBuffGroup`, `BattleEventEnhanceBuffGroup`, `RogueAeonDisplayID` | `DescParam`, `EffectDesc3`, `EffectParam1`, `EffectParam2`, `EffectParam3`, `EffectParam4` | path/aeon | Partial |
| `RogueDLCAeonCabinet.json` | 31 | `CabinetID` | `CabinetID`, `FinishAeonDimensionPointList`, `QuestID`, `UnlockCabinetID` | `CabinetDesc`, `CabinetIcon`, `CabinetMissionDesc`, `CabinetName`, `CabinetType`, `DescParam` | path/aeon | Partial |
| `RogueDLCAeonCross.json` | 16 | `MainAeonID+SubAeonID` | `BuffGroup`, `MainAeonID`, `SubAeonID` | — | path/aeon | Partial |
| `RogueDLCAeonDice.json` | 8 | `AeonDiceID` | `AeonDiceID`, `DiceModel` | `DescParam`, `DiceIcon`, `DiceShortDesc`, `DiceStartEffectDesc`, `ExtraEffect`, `StartDescParam` | path/aeon | Partial |
| `RogueDLCAeonDiceSurface.json` | 42 | `AeonSurfaceDiceID` | `AeonDiceID`, `AeonSurfaceDiceID`, `Dice3DSurfaceList` | `DescParam`, `DiceEffectParam`, `DiceEffectType`, `DiceSurfaceDesc`, `DiceSurfaceIcon`, `DiceSurfaceName` | path/aeon | Partial |
| `RogueDLCAeonDimension.json` | 7 | `AeonDimensionID` | `AeonDimensionID` | `AeonIcon`, `DimensionIcon`, `PlayShortDesc` | path/aeon | Partial |
| `RogueDLCAeonTalent.json` | 63 | `AeonTalentID` | `AeonDimensionID`, `AeonTalentID`, `EffectDescParamList`, `GamePlayEffectList` | `EffectDesc`, `EffectTitle`, `TalentIcon` | progression | Partial |
| `RogueDLCArea.json` | 16 | `AreaID` | `AreaGroupID`, `AreaID`, `AreaNameID`, `DifficultyID`, `LayerIDList` | `SubType` | mode area | Partial |
| `RogueDLCBlockIntro.json` | 20 | `BlockIntroID` | `BlockIntroID`, `IntroGroup` | `BlockIntroDesc`, `BlockIntroIcon`, `BlockIntroName`, `BlockTypeChessBoardColor`, `SubType` | mode support | Partial |
| `RogueDLCBlockType.json` | 16 | `BlockTypeID` | `BlockIntroID`, `BlockTypeID`, `BlockTypeNameID` | `BlockTypeChessBoardColor`, `BlockTypeChessBoardIcon`, `BlockTypeIcon` | taxonomy | Partial |
| `RogueDLCBossDecay.json` | 42 | `BossDecayID` | `BossDecayID`, `EffectParamList` | `BossDecayDesc`, `BossDecayName`, `BossEffectIcon`, `DecayIcon`, `DescParam`, `EffectType` | mode support | Partial |
| `RogueDLCChessBoard.json` | 216 | `ChessBoardID` | `BlockCreatGroupID`, `ChessBoardEventList`, `ChessBoardID` | — | mode support | Partial |
| `RogueDLCChessBoardAnimation.json` | 76 | `ModifierType+RogueSubMode` | `RogueSubMode` | `AnimationType`, `ModifierType` | mode support | Partial |
| `RogueDLCChessBoardEvent.json` | 150 | `ChessBoardEventID` | `ChessBoardEventID` | `ChessBoardEventDesc`, `ChessBoardEventName` | mode support | Partial |
| `RogueDLCConstValueClient.json` | 12 | `—` | — | `ConstValueName` | constants | Partial |
| `RogueDLCConstValueCommon.json` | 19 | `—` | — | `ConstValueName` | constants | Partial |
| `RogueDLCDiceSurfaceRarity.json` | 3 | `—` | — | `DiceSurfaceRarityImage`, `NameColor` | dice system | Partial |
| `RogueDLCDifficulty.json` | 37 | `DifficultyID` | `DifficultyCutList`, `DifficultyID`, `LevelList` | — | mode support | Partial |
| `RogueDLCEndGameReward.json` | 10 | `EndGameRewardID` | `EndGameRewardID`, `QuestID` | — | reward | Partial |
| `RogueDLCEntrance.json` | 3 | `ID` | `ID`, `RewardList` | `ButtonPath`, `PatternBgPath`, `SubType`, `SubTypeTitle`, `SwitchBannerImgPath` | mode support | Confirmed |
| `RogueDLCFinishWay.json` | 102 | `ID` | `ID`, `ParamIntList`, `ParamItemList` | `FinishType`, `ParamType` | mode support | Partial |
| `RogueDLCJoyHelp.json` | 17 | `AeonDimensionID` | `AeonDimensionID` | `PlayShortDesc` | mode support | Partial |
| `RogueDLCLayer.json` | 20 | `LayerID` | `LayerID`, `LayerNameID`, `LayerNumID` | `LayerIcon` | layer | Partial |
| `RogueDLCMainStory.json` | 13 | `MainStoryID` | `MainStoryID` | `MainStoryButtonIcon`, `MainStoryName`, `MainStoryToastType` | story | Partial |
| `RogueDLCMainStoryBranch.json` | 34 | `MainStoryBranchID` | `AeonID`, `MainStoryBranchID`, `RogueNPCID` | — | story | Partial |
| `RogueDLCMainStoryReward.json` | 14 | `QuestID` | `MainStoryID`, `QuestID` | — | story | Partial |
| `RogueDLCMarkType.json` | 8 | `BlockIntroID+MarkTypeID` | `BlockIntroID`, `MarkTypeID`, `MarkTypeNameID` | `MarkTypeChessBoardIcon` | taxonomy | Partial |
| `RogueDLCRoom.json` | 861 | `RogueRoomID` | `RogueRoomID`, `RogueSubMode` | — | room graph | Partial |
| `RogueDLCSubStory.json` | 42 | `RogueDLCSubStoryID` | `RogueDLCSubStoryID` | `ImgPath`, `LevelGraphPath`, `OptionPath`, `SubStoryName` | story | Partial |
| `RogueDLCSubStoryGroup.json` | 14 | `SubStoryGroupID` | `ShowGroup`, `SubStoryGroupID`, `SubStoryGroupName`, `SubStoryList`, `UnlockID` | — | pool/group | Partial |
| `RogueDLCUnlock.json` | 110 | `RogueUnlockID` | `RogueUnlockID` | — | unlock | Partial |
| `RogueDestroyProp.json` | 10 | `ParamGroupID` | `ParamGroupID` | — | mode support | Partial |
| `RogueDialogueDynamicDisplay.json` | 10 | `DisplayID` | `DisplayID` | `ContentText` | presentation | Partial |
| `RogueDialogueOption.json` | 1162 | `OptionID` | `OptionDisplayID`, `OptionID`, `ParamList` | — | mode support | Partial |
| `RogueDialogueOptionDisplay.json` | 2302 | `OptionDisplayID` | `OptionDisplayID` | `OptionDesc`, `OptionTitle` | presentation | Partial |
| `RogueEndlessConstValue.json` | 32 | `—` | — | `ConstValueName` | constants | Partial |
| `RogueEndlessMegaBuffDesc.json` | 8 | `MazeBuffID` | `MazeBuffID` | `BuffDesc`, `BuffPreshowDesc`, `BuffSimpleDesc` | buff/blessing | Partial |
| `RogueEscapeLaser.json` | 2 | `ParamGroupID` | `ParamGroupID` | — | mode support | Partial |
| `RogueEventSpecialOption.json` | 13 | `SpecialOptionID` | `SpecialOptionID` | `AeonFigure`, `AeonIcon` | mode support | Partial |
| `RogueGuideActivityPanelData.json` | 4 | `ActivityID` | `ActivityID`, `AvatarID`, `RogueAreaID` | — | mode support | Partial |
| `RogueHandBookEvent.json` | 96 | `EventHandbookID` | `EventHandbookID`, `EventTypeList`, `ImageID`, `UnlockNPCProgressIDList` | `EventTitle`, `EventType`, `UnlockHintDesc` | mode support | Partial |
| `RogueHandBookEventType.json` | 5 | `RogueHandBookEventType` | `ActivityModuleID` | `RogueEventTypeTitle`, `RogueHandBookEventType`, `TypeIcon` | taxonomy | Partial |
| `RogueHandbookMiracle.json` | 112 | `MiracleDisplayID` | `MiracleDisplayID`, `MiracleEffectDisplayID`, `MiracleHandbookID`, `MiracleTypeList` | — | curio/miracle | Partial |
| `RogueHandbookMiracleType.json` | 5 | `RogueHandbookMiracleType` | `ActivityModuleID` | `RogueHandbookMiracleType`, `RogueMiracleTypeTitle`, `TypeIcon` | taxonomy | Partial |
| `RogueHandbookType.json` | 4 | `HandBookType` | — | `HandBookIconPath`, `HandBookType`, `RogueHandBookDesc`, `RogueHandBookType` | taxonomy | Partial |
| `RogueHint.json` | 137 | `HintID` | `HintID` | `HintText` | mode support | Partial |
| `RogueImage.json` | 93 | `ImageID` | `ImageID` | `ImagePath`, `ImageType`, `TexturePath` | mode support | Partial |
| `RogueImmerseLevel.json` | 2 | `UnlockID` | `UnlockID` | — | mode support | Partial |
| `RogueMagicAdventureRoom.json` | 9 | `RoomID` | `ParamGroupID`, `RoomID` | `AdventureType` | room graph | Partial |
| `RogueMagicArea.json` | 13 | `AreaID` | `AreaGroupID`, `AreaID`, `AreaNameID`, `DifficultyIDList`, `ExtraLayerID` | `CustomStageDisplayIcon` | mode area | Partial |
| `RogueMagicConstClient.json` | 12 | `—` | — | `ConstValueName` | constants | Partial |
| `RogueMagicConstCommon.json` | 14 | `—` | — | `ConstValueName` | constants | Partial |
| `RogueMagicContentDisplay.json` | 39 | `DisplayID` | `DisplayID` | — | presentation | Partial |
| `RogueMagicDifficultyComp.json` | 6 | `DifficultyCompID` | `DifficultyCompID`, `ParamList`, `UnlockID` | `DifficultyDesc` | mode support | Partial |
| `RogueMagicDifficultyDrop.json` | 91 | `—` | `AreaID`, `MonsterEliteDropDisplayID` | — | mode support | Partial |
| `RogueMagicFinishway.json` | 135 | `ID` | `ID`, `ParamIntList`, `ParamItemList` | `FinishType`, `ParamType` | mode support | Partial |
| `RogueMagicGambleGroup.json` | 10 | `GambleGroupID` | `GambleGroupID`, `GambleGroupIcon`, `GambleGroupLevel`, `GambleGroupType` | — | pool/group | Partial |
| `RogueMagicGambleUnit.json` | 7 | `GambleUnitID` | `GambleUnitID` | `GambleUnitIcon`, `GambleUnitType` | mode support | Partial |
| `RogueMagicLayer.json` | 32 | `LayerID` | `LayerID`, `LayerNumID` | — | layer | Partial |
| `RogueMagicLayerEffect.json` | 1 | `LayerEffectID` | `DescParamList`, `LayerEffectID` | `LayerEffectDesc`, `LayerEffectName` | effect/presentation | Partial |
| `RogueMagicLayerRoom.json` | 176 | `—` | `LayerID` | — | room graph | Partial |
| `RogueMagicMazeBuff.json` | 387 | `—` | `ID`, `ParamList` | `BuffDesc`, `BuffEffect`, `BuffIcon`, `BuffName`, `BuffRarity`, `BuffSeries` | buff/blessing | Partial |
| `RogueMagicMiracle.json` | 81 | `MiracleEffectDisplayID` | `MiracleDisplayID`, `MiracleEffectDisplayID`, `MiracleID`, `UnlockHandbookMiracleID` | — | curio/miracle | Partial |
| `RogueMagicMiracleDisplay.json` | 0 | `—` | — | — | presentation | Partial |
| `RogueMagicMiracleGroup.json` | 47 | `RogueMiracleGroupID` | `RogueMiracleGroupID` | — | pool/group | Partial |
| `RogueMagicMiscDisplay.json` | 7 | `DisplayID` | `DisplayID` | — | presentation | Partial |
| `RogueMagicNPC.json` | 55 | `RogueNPCID` | `RogueNPCID` | `NPCJsonPath` | NPC | Partial |
| `RogueMagicRoom.json` | 1518 | `RogueRoomID` | `RogueRoomID` | `RogueRoomType` | room graph | Partial |
| `RogueMagicRoomMark.json` | 18 | `MarkType+RoomType` | — | `MarkType`, `RoomIconEffect`, `RoomType`, `RoomTypeIcon`, `RoomTypeName`, `ToastIcon` | room graph | Partial |
| `RogueMagicScepter.json` | 72 | `—` | `EffectTypeList`, `ScepterID`, `StaffMazeBuffID`, `UnlockID` | `FuncType`, `LimitRangeType`, `StyleType` | mode support | Partial |
| `RogueMagicScepterDisplay.json` | 24 | `ScepterID` | `ScepterID` | `ScepterBGDesc`, `ScepterFigurePath`, `ScepterIconPath`, `ScepterName`, `ScepterTriggerDesc` | presentation | Partial |
| `RogueMagicScore.json` | 133 | `—` | — | — | mode support | Partial |
| `RogueMagicStory.json` | 39 | `StoryID` | `IsHide`, `StoryID` | `LevelGraphPath`, `StoryCategory`, `StoryImage`, `StoryName` | story | Partial |
| `RogueMagicStyleTypeSelect.json` | 4 | `DisplayID` | `DisplayID`, `UnlockID` | `EnumDesc`, `EnumType`, `IconPath` | taxonomy | Partial |
| `RogueMagicTalent.json` | 25 | `TalentID` | `NameDisplayID`, `TalentID` | `DescParams`, `EffectDesc`, `TalentIcon` | progression | Partial |
| `RogueMagicUnit.json` | 277 | `—` | `AttachRangeTypeList`, `EffectTypeList`, `ExtraEffectID`, `MagicUnitID`, `MagicUnitMazeBuffID` | `FuncType`, `MagicUnitCategory`, `MagicUnitDesc`, `MagicUnitSimpleDesc`, `MagicUnitType`, `SpecialType` | mode support | Partial |
| `RogueMagicUnitDisplay.json` | 109 | `MagicUnitID` | `MagicUnitID` | `MagicUnitIcon`, `MagicUnitName` | presentation | Partial |
| `RogueMagicUnlock.json` | 30 | `RogueUnlockID` | `RogueUnlockID` | — | unlock | Partial |
| `RogueMagicWorkbench.json` | 4 | `WorkbenchID` | `FuncList`, `WorkbenchID` | — | mode support | Partial |
| `RogueMagicWorkbenchFunc.json` | 5 | `FuncID` | `FuncID` | `FuncDesc`, `FuncIcon`, `FuncName`, `FuncType` | mode support | Partial |
| `RogueManager.json` | 78 | `RogueSeason` | `RogueAreaIDList`, `RogueSeason`, `RogueVersion`, `ScheduleDataID` | — | schedule/ownership | Partial |
| `RogueMap.json` | 615 | `RogueMapID+SiteID` | `NextSiteIDList`, `RogueMapID`, `SiteID` | — | mode support | Partial |
| `RogueMazeBuff.json` | 1851 | `—` | `BuffDescParamByAvatarSkillID`, `ID`, `ParamList` | `BuffDesc`, `BuffDescBattle`, `BuffEffect`, `BuffIcon`, `BuffName`, `BuffRarity` | buff/blessing | Confirmed |
| `RogueMiracle.json` | 250 | `MiracleID` | `MiracleDisplayID`, `MiracleEffectDisplayID`, `MiracleID`, `UnlockHandbookMiracleID` | — | curio/miracle | Confirmed |
| `RogueMiracleDisplay.json` | 314 | `MiracleDisplayID` | `MiracleDisplayID` | `MiracleBGDesc`, `MiracleFigureIconPath`, `MiracleIconPath`, `MiracleName` | presentation | Partial |
| `RogueMiracleDisplayTest.json` | 0 | `—` | — | — | presentation | Partial |
| `RogueMiracleEffect.json` | 1038 | `MiracleEffectID` | `MiracleEffectID`, `ParamList` | `MiracleDesc` | effect/presentation | Partial |
| `RogueMiracleEffectDisplay.json` | 769 | `MiracleEffectDisplayID` | `DescParamList`, `MiracleEffectDisplayID` | `ExtraEffect`, `MiracleDesc`, `MiracleSimpleDesc` | presentation | Partial |
| `RogueMiracleEffectTest.json` | 0 | `—` | — | — | effect/presentation | Partial |
| `RogueMiracleGroup.json` | 100 | `RogueMiracleGroupID` | `RogueMiracleGroupID` | — | pool/group | Partial |
| `RogueMonster.json` | 1998 | `RogueMonsterID` | `EventID`, `NpcMonsterID`, `RogueMonsterID` | `MonsterDropType` | mode support | Partial |
| `RogueMonsterEliteDropItem.json` | 27 | `MonsterEliteDropItemID` | `MonsterEliteDropItemDisplayList`, `MonsterEliteDropItemID` | — | mode support | Partial |
| `RogueMonsterGroup.json` | 852 | `RogueMonsterGroupID` | `RogueMonsterGroupID`, `RogueMonsterListAndWeight` | — | pool/group | Partial |
| `RogueNPC.json` | 260 | `RogueNPCID` | `RogueNPCID` | `NPCJsonPath` | NPC | Partial |
| `RogueNousAeon.json` | 9 | `AeonID` | `AeonID`, `BattleEventBuffGroup`, `BattleEventEnhanceBuffGroup`, `DisplayID` | `EffectDesc1`, `EffectParam1`, `EffectType1`, `RogueBuffType` | path/aeon | Partial |
| `RogueNousAeonCross.json` | 18 | `MainAeonID+SubAeonID` | `BuffGroup`, `MainAeonID`, `SubAeonID` | — | path/aeon | Partial |
| `RogueNousConstValueClient.json` | 25 | `—` | — | `ConstValueName` | constants | Partial |
| `RogueNousConstValueCommon.json` | 22 | `—` | — | `ConstValueName` | constants | Partial |
| `RogueNousDiceBranch.json` | 12 | `BranchID` | `BranchID`, `DefaultCommonSurfaceList`, `RecommendSurfaceList`, `SuggestiveSurfaceList`, `UnlockID` | `BranchIcon`, `BranchName`, `DiceIcon`, `EffectDesc`, `EffectDescParam1`, `EffectDescParam2` | dice system | Partial |
| `RogueNousDiceBranchTag.json` | 4 | `TagID` | `TagID` | `BranchTagName`, `TagIcon` | dice system | Partial |
| `RogueNousDiceBranchValue.json` | 108 | `AeonID+BranchID` | `AeonID`, `BranchID`, `ParamList` | `BranchEffectDesc` | dice system | Partial |
| `RogueNousDiceSlot.json` | 6 | `SlotID` | `SlotID` | `SlotName`, `UpgradedSlotName` | dice system | Partial |
| `RogueNousDiceSurface.json` | 80 | `ItemID` | `ItemID`, `SlotList`, `SurfaceID`, `TagList`, `UnlockDisplayID` | `DescParam`, `ExtraDesc`, `Icon`, `SurfaceDesc`, `SurfaceName` | dice system | Partial |
| `RogueNousDifficultyLevel.json` | 12 | `DifficultyID` | `DifficultyID`, `ParamList` | `DifficultyDesc`, `DifficultyType` | mode support | Partial |
| `RogueNousEndGameReward.json` | 2 | `EndGameRewardID` | `EndGameRewardID`, `QuestID`, `QuestList`, `UnlockID` | `TabTitle` | reward | Partial |
| `RogueNousMainStory.json` | 8 | `QuestID` | `DisplayID`, `QuestID`, `RogueNPCID`, `StoryGroup`, `StoryID` | `MainStoryName` | story | Partial |
| `RogueNousMiscDisplay.json` | 20 | `DisplayID` | `DisplayID` | — | presentation | Partial |
| `RogueNousMissionReward.json` | 5 | `MissionRewardID` | `MissionRewardID`, `QuestList` | `TabTitle` | reward | Partial |
| `RogueNousRoom.json` | 1224 | `RogueRoomID` | `RogueRoomID`, `RogueSubMode` | — | room graph | Partial |
| `RogueNousStoryDisplay.json` | 14 | `DisplayID` | `DisplayID` | — | presentation | Partial |
| `RogueNousStoryReward.json` | 29 | `QuestID` | `QuestID` | — | story | Partial |
| `RogueNousSubStory.json` | 20 | `QuestID` | `DisplayID`, `NextIDList`, `QuestID`, `StoryID`, `TalkNameID` | `LevelGraphPath` | story | Partial |
| `RogueNousSurfaceTag.json` | 10 | `TagID` | `TagID` | `TagName` | mode support | Partial |
| `RogueNousTalent.json` | 40 | `TalentID` | `EffectDescParamList`, `NextTalentIDList`, `TalentID`, `UnlockIDList` | `EffectDesc`, `EffectTag`, `EffectTitle`, `Icon` | progression | Partial |
| `RogueNousValueAreaLimit.json` | 13 | `AreaID` | `AreaID` | — | mode area | Partial |
| `RoguePersonaConstClient.json` | 1 | `—` | — | `ConstValueName` | constants | Partial |
| `RoguePersonaConstCommon.json` | 6 | `—` | — | `ConstValueName` | constants | Partial |
| `RoguePersonaLayerRoom.json` | 60 | `—` | `EEPIDJJJMAH` | — | room graph | Partial |
| `RoguePersonaRoomAttribute.json` | 55 | `—` | — | — | room graph | Partial |
| `RoguePersonaRoomCompType.json` | 19 | `—` | `HCBADDHNIDG`, `LHLKJIDFLIN` | — | taxonomy | Partial |
| `RoguePersonaRoomComposition.json` | 153 | `—` | — | — | room graph | Partial |
| `RoguePersonaRoomPreset.json` | 35 | `—` | — | — | room graph | Partial |
| `RoguePersonaStyle.json` | 15 | `—` | — | — | mode support | Partial |
| `RoguePersonaStyleGift.json` | 337 | `—` | `NIKKAPEIDJO` | — | mode support | Partial |
| `RoguePersonaTalent.json` | 24 | `—` | — | — | progression | Partial |
| `RoguePersonaTalentGroup.json` | 6 | `—` | — | — | pool/group | Partial |
| `RogueRoom.json` | 704 | `RogueRoomID` | `GroupID`, `GroupWithContent`, `RogueRoomID` | `RogueRoomType` | room graph | Partial |
| `RogueRoomType.json` | 9 | `RogueRoomType` | `RogueRoomTypeTextmapID`, `RoomTypeDescTextmapID`, `RoomTypeDescTextmapID2` | `MapShowType`, `RogueRoomType`, `RogueRoomTypeIcon`, `RoomIconEffect` | taxonomy | Partial |
| `RogueScoreReward.json` | 70 | `—` | `RewardPoolID` | — | reward | Partial |
| `RogueShop.json` | 29 | `RogueShopID` | `RogueShopID`, `StageID` | `ShopType` | mode support | Partial |
| `RogueTalent.json` | 42 | `TalentID` | `EffectDescParamList`, `NextTalentIDList`, `TalentID`, `UnlockIDList` | `EffectDesc`, `EffectTag`, `EffectTitle`, `Icon` | progression | Partial |
| `RogueTalkNameColor.json` | 77 | `TextmapID` | `TextmapID` | — | mode support | Partial |
| `RogueTalkNameConfig.json` | 524 | `TalkNameID` | `ImageID`, `TalkNameID` | `IconPath`, `Name`, `SubName` | mode support | Partial |
| `RogueTournAdventureRoom.json` | 32 | `RoomID` | `ParamGroupID`, `RoomID` | `AdventureType` | room graph | Partial |
| `RogueTournArea.json` | 270 | `—` | — | — | mode area | Partial |
| `RogueTournAreaGroup.json` | 2 | `—` | — | — | pool/group | Partial |
| `RogueTournAreaGroupByTourn.json` | 3 | `—` | — | — | pool/group | Partial |
| `RogueTournAvatar.json` | 80 | `AvatarID` | `AvatarID`, `SpecialAvatarID` | — | mode support | Partial |
| `RogueTournBuff.json` | 900 | `—` | `ExtraEffectIDList`, `MazeBuffID` | `MazeBuffLevel`, `RogueBuffCategory`, `RogueBuffTag`, `RogueBuffType` | buff/blessing | Confirmed |
| `RogueTournBuffGroup.json` | 456 | `RogueBuffGroupID` | `RogueBuffGroupID`, `TournMode` | `RogueBuffDrop` | pool/group | Partial |
| `RogueTournBuffType.json` | 10 | `RogueBuffType` | — | `RogueBuffType`, `RogueBuffTypeDecoName`, `RogueBuffTypeIcon`, `RogueBuffTypeLargeIcon`, `RogueBuffTypeName`, `RogueBuffTypeSmallIcon` | taxonomy | Partial |
| `RogueTournBuildRefAvatar.json` | 84 | `AvatarID` | `AvatarID` | — | mode support | Partial |
| `RogueTournCocoonConfig.json` | 70 | `EventID` | `DisplayID`, `DisplayItemList`, `DropList`, `EventID`, `ID` | `PicPath`, `RecommendDamageTypes` | mode support | Partial |
| `RogueTournCollection.json` | 22 | `CollectionID` | `CollectionID`, `EntityRuntimeReplaceArtPrefabID`, `ParamList`, `UnlockID` | `CollectionDesc`, `CollectionEffectDesc`, `CollectionName`, `IconPath`, `SlotIconPath` | mode support | Partial |
| `RogueTournCollectionConfig.json` | 8 | `PillarID` | `PillarID` | — | mode support | Partial |
| `RogueTournConstClient.json` | 21 | `—` | — | `ConstValueName` | constants | Partial |
| `RogueTournConstCommon.json` | 35 | `—` | — | `ConstValueName` | constants | Partial |
| `RogueTournContentDisplay.json` | 30 | `DisplayID` | `DisplayID` | — | presentation | Partial |
| `RogueTournCurseChest.json` | 29 | `ChestID` | `ChestID`, `MainDescDisplayID`, `MainTitleDisplayID`, `SubDescDisplayID`, `SubTitleDisplayID` | `IconPath`, `Type` | mode support | Partial |
| `RogueTournDifficulty.json` | 58 | `DifficultyID` | `DifficultyID`, `LevelList` | — | mode support | Partial |
| `RogueTournDifficultyComp.json` | 8 | `—` | — | — | mode support | Partial |
| `RogueTournDivision.json` | 10 | `—` | — | `DivisionHintDesc`, `DivisionIconPath`, `DivisionIconPrefabPath`, `DivisionName`, `DivisionSmallIconPath` | mode support | Partial |
| `RogueTournDivisionEffect.json` | 9 | `—` | `DescParamList` | `DescText` | effect/presentation | Partial |
| `RogueTournExhibition.json` | 70 | `ExhibitionID` | `ExhibitionID`, `ProgramGroupID` | `ExhibitionType`, `IconPath`, `ImagePath`, `SlotIconPath` | mode support | Partial |
| `RogueTournExhibitionConfig.json` | 12 | `PaintingID` | `PaintingID` | `Type` | mode support | Partial |
| `RogueTournExpReward.json` | 300 | `RewardID` | `MainTournID`, `RewardID` | — | reward | Partial |
| `RogueTournExpScore.json` | 119 | `ID` | `ID`, `ScoreExpID` | — | mode support | Partial |
| `RogueTournExpScore_Index_ScoreExpID.json` | 11 | `—` | — | — | mode support | Partial |
| `RogueTournFinishway.json` | 104 | `ID` | `ID`, `ParamIntList`, `ParamItemList` | `FinishType`, `ParamType` | mode support | Partial |
| `RogueTournFormula.json` | 328 | `FormulaID` | `FormulaDisplayID`, `FormulaID`, `MainBuffTypeID`, `MazeBuffID`, `SubBuffTypeID` | `FormulaCategory`, `MainBuffNum`, `SubBuffNum` | formula/equation | Confirmed |
| `RogueTournFormulaAeonIcon.json` | 10 | `BuffTypeID` | `BuffTypeID` | `FormulaIcon`, `FormulaSubIcon`, `UltraFormulaCardIcon`, `UltraFormulaIcon` | formula/equation | Partial |
| `RogueTournFormulaDisplay.json` | 324 | `FormulaDisplayID` | `FormulaDisplayID`, `HandbookUnlockDisplayID` | `ExtraEffect` | presentation | Partial |
| `RogueTournFormulaRandom.json` | 139 | `RandomID` | `RandomID` | — | formula/equation | Partial |
| `RogueTournGambleGroup.json` | 126 | `GambleGroupID` | `GambleGroupID`, `GambleGroupIcon`, `GambleGroupLevel`, `GambleGroupType`, `GroupName` | — | pool/group | Partial |
| `RogueTournGambleUnit.json` | 89 | `GambleUnitID` | `GambleUnitID` | `GambleUnitIcon`, `GambleUnitType`, `UnitTextureParam` | mode support | Partial |
| `RogueTournHandBookEvent.json` | 128 | `EventHandbookID` | `EventHandbookID`, `ImageID`, `TypeDisplayID`, `UnlockDisplayID`, `UnlockNPCProgressIDList` | `EventTitle` | mode support | Partial |
| `RogueTournHandbookMiracle.json` | 544 | `HandbookMiracleID` | `HandbookMiracleID`, `MiracleDisplayID`, `MiracleEffectID` | `MiracleCategory`, `UnlockDesc` | curio/miracle | Partial |
| `RogueTournHex.json` | 26 | `DisplayID` | `DisplayID`, `HexID`, `MazeBuffID`, `TournMode` | `AvatarDamageType`, `AvatarType`, `ExtraEffect` | mode support | Confirmed |
| `RogueTournHexAvatarBaseType.json` | 57 | `MiracleID` | `MiracleID` | `AvatarDamageType`, `AvatarType` | taxonomy | Partial |
| `RogueTournHexDisplay.json` | 34 | `HexDisplayID` | `HexDisplayID` | `BgDesc`, `FigureIconPath`, `IconPath`, `Name` | presentation | Partial |
| `RogueTournKeyword.json` | 25 | `KeywordID` | `KeywordID`, `MazeBuffID`, `MazeBuffList`, `RogueFormulaList` | `ExtraEffect`, `KeywordBuffType`, `KeywordExtraEffect`, `KeywordIcon` | mode support | Partial |
| `RogueTournKeywordParam.json` | 9 | `KeywordID` | `KeywordID`, `ParamList` | — | mode support | Partial |
| `RogueTournLayer.json` | 34 | `LayerID` | `LayerID`, `LayerNumID` | — | layer | Partial |
| `RogueTournLayerRoom.json` | 103 | `—` | `LayerID` | — | room graph | Partial |
| `RogueTournMiracle.json` | 699 | `MiracleID` | `HandbookMiracleID`, `MiracleDisplayID`, `MiracleEffectID`, `MiracleID`, `TournMode` | `MiracleCategory` | curio/miracle | Confirmed |
| `RogueTournMiracleDisplay.json` | 166 | `MiracleDisplayID` | `MiracleDisplayID` | `MiracleBGDesc`, `MiracleFigureIconPath`, `MiracleIconPath`, `MiracleName` | presentation | Partial |
| `RogueTournMiracleGroup.json` | 288 | `RogueMiracleGroupID` | `RogueMiracleGroupID` | — | pool/group | Partial |
| `RogueTournMiracleGroupTest.json` | 0 | `—` | — | — | pool/group | Partial |
| `RogueTournMiracleTest.json` | 0 | `—` | — | — | curio/miracle | Partial |
| `RogueTournMiscDisplay.json` | 17 | `DisplayID` | `DisplayID` | — | presentation | Partial |
| `RogueTournModule.json` | 9 | `ActivityModuleID` | `ActivityModuleID`, `MainTournID`, `SubTournID` | — | mode module | Confirmed |
| `RogueTournNPC.json` | 316 | `RogueNPCID` | `RogueNPCID` | `NPCJsonPath` | NPC | Partial |
| `RogueTournPermanentTalent.json` | 38 | `TalentID` | `EffectDescParamList`, `NextTalentIDList`, `TalentID` | `EffectDesc`, `EffectTag`, `EffectTitle`, `Icon` | progression | Partial |
| `RogueTournRecordShowcase.json` | 13 | `—` | `AreaID` | `RankIconLargePath`, `RankIconPath`, `RankName`, `RankTextColor` | mode support | Partial |
| `RogueTournRole.json` | 97 | `AvatarID` | `AvatarID`, `BuffID` | — | mode support | Partial |
| `RogueTournRoom.json` | 1338 | `RogueRoomID` | `RogueRoomID`, `TournMode` | `RogueRoomType`, `VariantType` | room graph | Partial |
| `RogueTournRoomGroup.json` | 27 | `—` | `RoomGroupID`, `RoomTypeList` | — | pool/group | Partial |
| `RogueTournRoomMark.json` | 24 | `—` | `ICIDICKIDCB`, `LHLKJIDFLIN` | — | room graph | Partial |
| `RogueTournTitanBless.json` | 84 | `MazeBuffID` | `BlessBattleDisplayCategoryList`, `ExtraEffectIDList`, `MazeBuffID`, `TitanBlessID` | `TitanType` | mode support | Partial |
| `RogueTournTitanTalent.json` | 36 | `ID` | `DescParamList`, `ID`, `PreID` | `ActTitle`, `TalentDesc`, `TalentIconPath`, `TalentTitle`, `TitanType` | progression | Partial |
| `RogueTournTitanType.json` | 12 | `RogueTitanType` | `RogueTitanAvatarRoundIconMid` | `CharacterName`, `RogueTitanAvatarRoundIconSmall`, `RogueTitanCardIcon`, `RogueTitanCardShadowIcon`, `RogueTitanCategory`, `RogueTitanTalentIcon` | taxonomy | Partial |
| `RogueTournUnlock.json` | 97 | `RogueUnlockID` | `RogueUnlockID` | — | unlock | Partial |
| `RogueTournUseBuffType.json` | 3 | `—` | `TournMode`, `UseBuffTypeList` | — | taxonomy | Partial |
| `RogueTournWeeklyChallenge.json` | 108 | `ChallengeID` | `ChallengeID`, `DisplayFinalMonsterGroups`, `DisplayMonsterGroups1`, `DisplayMonsterGroups2`, `DisplayMonsterGroups3` | `WeeklyName` | mode support | Partial |
| `RogueTournWeeklyDisplay.json` | 283 | `WeeklyDisplayID` | `WeeklyDisplayID` | `DescParams` | presentation | Partial |
| `RogueTournWorkbench.json` | 14 | `WorkbenchID` | `FuncList`, `WorkbenchID` | — | mode support | Partial |
| `RogueTournWorkbenchFunc.json` | 10 | `FuncID` | `FuncID` | `DisableFuncDesc`, `FuncDesc`, `FuncName`, `FuncType` | mode support | Partial |
| `RogueTurntable.json` | 9 | `—` | `ParamGroupID` | — | mode support | Partial |
| `RogueUnlockConfig.json` | 299 | `RogueUnlockID` | `RogueUnlockID` | — | unlock | Partial |
| `RogueUpgradeAvatar.json` | 7 | `—` | — | — | mode support | Partial |
| `RogueUpgradeAvatarConst.json` | 3 | `—` | — | `ConstValueName` | constants | Partial |
| `RogueUpgradeAvatarEquipment.json` | 8 | `AvatarBaseType` | `EquipmentID` | `AvatarBaseType` | mode support | Partial |
| `RogueUpgradeAvatarSubRelic.json` | 552 | `—` | `RelicSubValueList` | `RelicType`, `SubRelicType` | mode support | Partial |
| `RogueUpgradeAvatarSubType.json` | 2 | `AvatarID` | `AvatarID` | `SubRelicType` | taxonomy | Partial |
| `RogueUpgradeAvatarSubValue.json` | 276 | `—` | `RelicSubValueList` | `RelicType` | mode support | Partial |
| `RogueWolfGunMiracleTarget.json` | 421 | `MiracleID` | `GameMode`, `LayerMiddle`, `MiracleID` | — | curio/miracle | Partial |
| `ScheduleDataRogue.json` | 78 | `ID` | `ID` | — | mode support | Partial |
