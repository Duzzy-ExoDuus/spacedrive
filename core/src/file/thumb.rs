use crate::job::jobs::JobReportUpdate;
use crate::prisma::FilePathData;
use crate::state::client;
use crate::sys;
use crate::{
  job::{jobs::Job, worker::WorkerContext},
  prisma::FilePath,
  CoreContext,
};
use anyhow::Result;
use image::*;
use prisma_client_rust::or;
use std::fs;
use std::path::Path;
use webp::*;

#[derive(Debug)]
pub struct ThumbnailJob {
  pub location_id: i32,
}

static THUMBNAIL_SIZE_FACTOR: f32 = 0.2;
static THUMBNAIL_QUALITY: f32 = 30.0;
static CACHE_DIR_NAME: &str = "thumbnails";

#[async_trait::async_trait]
impl Job for ThumbnailJob {
  async fn run(&self, ctx: WorkerContext) -> Result<()> {
    let config = client::get();
    let core_ctx = ctx.core_ctx.clone();

    let location = sys::locations::get_location(&core_ctx, self.location_id).await?;

    fs::create_dir_all(
      Path::new(&config.data_path)
        .join(CACHE_DIR_NAME)
        .join(format!("{}", self.location_id)),
    )
    .unwrap();

    let root_path = location.path.unwrap();

    let image_files = get_images(&core_ctx, self.location_id).await?;

    let location_id = location.id.clone();

    println!("Found {:?} files", image_files.len());

    tokio::task::spawn_blocking(move || {
      ctx.progress(vec![
        JobReportUpdate::TaskCount(image_files.len()),
        JobReportUpdate::Message(format!("Preparing to process {} files", image_files.len())),
      ]);

      for (i, image_file) in image_files.iter().enumerate() {
        ctx.progress(vec![JobReportUpdate::Message(format!(
          "Processing {}",
          image_file.materialized_path.clone()
        ))]);
        let path = format!("{}{}", root_path, image_file.materialized_path);
        let checksum = image_file.temp_checksum.as_ref().unwrap();

        generate_thumbnail(&path, checksum, location_id).unwrap();

        ctx.progress(vec![JobReportUpdate::CompletedTaskCount(i + 1)]);
      }
    })
    .await
    .unwrap();

    Ok(())
  }
}

pub fn generate_thumbnail(file_path: &str, file_hash: &str, location_id: i32) -> Result<()> {
  let config = client::get();
  // Using `image` crate, open the included .jpg file
  let img = image::open(file_path).unwrap();
  let (w, h) = img.dimensions();
  // Optionally, resize the existing photo and convert back into DynamicImage
  let img: DynamicImage = image::DynamicImage::ImageRgba8(imageops::resize(
    &img,
    (w as f32 * THUMBNAIL_SIZE_FACTOR) as u32,
    (h as f32 * THUMBNAIL_SIZE_FACTOR) as u32,
    imageops::FilterType::Triangle,
  ));
  // Create the WebP encoder for the above image
  let encoder: Encoder = Encoder::from_image(&img).unwrap();

  // Encode the image at a specified quality 0-100
  let webp: WebPMemory = encoder.encode(THUMBNAIL_QUALITY);
  // Define and write the WebP-encoded file to a given path
  let output_path = Path::new(&config.data_path)
    .join(CACHE_DIR_NAME)
    .join(format!("{}", location_id))
    .join(file_hash)
    .with_extension("webp");

  println!("Writing to {}", output_path.display());

  std::fs::write(&output_path, &*webp).unwrap();

  Ok(())
}

pub async fn get_images(ctx: &CoreContext, location_id: i32) -> Result<Vec<FilePathData>> {
  let image_files = ctx
    .database
    .file_path()
    .find_many(vec![
      FilePath::location_id().equals(location_id),
      or!(
        FilePath::extension().equals("png".to_string()),
        FilePath::extension().equals("jpeg".to_string()),
        FilePath::extension().equals("jpg".to_string()),
        FilePath::extension().equals("gif".to_string()),
        FilePath::extension().equals("webp".to_string()),
      ),
    ])
    .exec()
    .await?;

  Ok(image_files)
}